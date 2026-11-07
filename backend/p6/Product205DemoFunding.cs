// Service Studio Model API migration for T3RE_Advance_CS.
// Apply once to the pre-migration module; no credentials or runtime bank calls here.
// Alan's project workaround: approval -> DepositCash(principal) -> verified receipt.
eSpace => {
    var journal = eSpace.Entities.OfType<IServerEntity>().Named("AdvanceAcceptanceOperation");
    if (journal.Attributes.Any(a => a.Name == "DemoFundingRecorded"))
        throw new Exception("Product205DemoFunding is already installed; inspect before reapplying.");
    var bank = eSpace.Integrations.OfType<ServiceStudio.Plugin.REST.IRestClient>().Named("TBankLoans");
    var core = eSpace.References.Named("T3RE_Core_Lib");
    var system = eSpace.References.Named("(System)");
    var operationResult = eSpace.Structures.Named("CSOperationResult");

    foreach (var name in new[] { "QuotedInterestRate", "QuotedTotalInterest", "QuotedMonthlyInstalment" }) {
        var field = journal.CreateAttribute(name);
        field.DataType = eSpace.DecimalType; field.Length = 37; field.Decimals = 8;
    }
    journal.CreateAttribute("QuotedMaturityDate").DataType = eSpace.DateType;
    journal.CreateAttribute("DemoFundingRecorded").DataType = eSpace.BooleanType;
    journal.CreateAttribute("DemoFundingDispatchedAt").DataType = eSpace.DateTimeType;
    journal.CreateAttribute("DemoFundingDate").DataType = eSpace.DateType;
    var txn = journal.CreateAttribute("DemoFundingTxnId"); txn.DataType = eSpace.TextType; txn.Length = 100;
    foreach (var name in new[] { "DemoFundingBalanceBefore", "DemoFundingBalanceAfter" }) {
        var field = journal.CreateAttribute(name);
        field.DataType = eSpace.DecimalType; field.Length = 37; field.Decimals = 2;
    }

    // Reuse the existing callback, which derives HTTP status and receipt-field
    // presence locally from the response and strips spoofed reserved headers.
    var depositRequest = bank.CreateStructure("TBDepositRequest");
    var account = depositRequest.CreateAttribute("AccountId"); account.DataType = eSpace.TextType; account.NameInJSON = "AccountId";
    var amount = depositRequest.CreateAttribute("Amount"); amount.DataType = eSpace.DecimalType; amount.NameInJSON = "Amount";
    var narrative = depositRequest.CreateAttribute("Narrative"); narrative.DataType = eSpace.TextType; narrative.NameInJSON = "Narrative";
    var deposit = bank.CreateAction("DepositDemoPrincipal");
    deposit.Description = "Teaching-bank workaround approved by Alan. Only called after a durable BANK_DEMO_DEPOSIT checkpoint. Never retry an uncertain deposit.";
    deposit.HTTPMethod = ServiceStudio.Plugin.REST.Enumerations.HTTPMethod.PUT;
    deposit.URLPath = "/Gateway/rest/Account/{CustomerId}/DepositCash";
    deposit.RequestFormat = ServiceStudio.Plugin.REST.Enumerations.RequestFormat.JSON;
    deposit.ResponseFormat = ServiceStudio.Plugin.REST.Enumerations.ResponseFormat.JSON;
    deposit.TimeoutinSeconds = 30;
    var auth = deposit.CreateInputParameter("BankAuthorization"); auth.DataType = eSpace.TextType;
    auth.InputPlacement = ServiceStudio.Plugin.REST.Enumerations.InputPlacement.HeaderPlacement;
    auth.IsMandatory = true;
    auth.OriginalName = "Authorization"; auth.IsSensitive = ServiceStudio.Plugin.REST.Enumerations.IsSensitive.Sensitive;
    var customer = deposit.CreateInputParameter("CustomerId"); customer.DataType = eSpace.TextType; customer.OriginalName = "CustomerId";
    customer.InputPlacement = ServiceStudio.Plugin.REST.Enumerations.InputPlacement.UrlPlacement;
    customer.IsMandatory = true;
    var body = deposit.CreateInputParameter("Request"); body.DataType = depositRequest;
    body.InputPlacement = ServiceStudio.Plugin.REST.Enumerations.InputPlacement.BodyPlacement;
    body.IsMandatory = true;
    body.IsSensitive = ServiceStudio.Plugin.REST.Enumerations.IsSensitive.Sensitive;
    var response = deposit.CreateOutputParameter("Response"); response.DataType = bank.Structures.Named("TBRepayResponse");
    response.OutputPlacement = ServiceStudio.Plugin.REST.Enumerations.OutputPlacement.BodyPlacement;
    response.IsSensitive = ServiceStudio.Plugin.REST.Enumerations.IsSensitive.Sensitive;
    foreach (var pair in new[] { new[] { "ObservedHttpStatus", "X-P6-Observed-Status" }, new[] { "ObservedReceiptFields", "X-P6-Receipt-Fields" } }) {
        var output = deposit.CreateOutputParameter(pair[0]); output.DataType = eSpace.IntegerType;
        output.OutputPlacement = ServiceStudio.Plugin.REST.Enumerations.OutputPlacement.HeaderPlacement; output.OriginalName = pair[1];
    }

    // Product 205 keeps its own exact quote/cap checks. Legacy 207 policy stays intact.
    var check = eSpace.ServerActions.Named("CheckEligibilityPlanResponse");
    var checkStart = check.Nodes.OfType<OutSystems.Model.Logic.Nodes.IStartNode>().Single();
    var legacyCheck = checkStart.Target;
    var productBranch = check.CreateNode<IIfNode>(); productBranch.Label = "Product205Policy";
    productBranch.SetCondition("Response.TBankLoanProductId = 205");
    checkStart.Target = productBranch; productBranch.FalseTarget = legacyCheck;
    var check205 = check.CreateNode<IExecuteServerActionNode>("ValidateProduct205Policy");
    check205.Action = eSpace.ServerActions.Named("CheckProduct205Eligibility");
    foreach (var p in check205.Action.InputParameters) check205.SetArgumentValue(p, p.Name == "ObservedTermFields" ? "1" : p.Name);
    productBranch.TrueTarget = check205;
    var map205 = check.CreateNode<IAssignNode>().ConnectedBelow(check205);
    map205.CreateAssignment("Check.IsConsistent", "ValidateProduct205Policy.Result.IsConsistent");
    map205.CreateAssignment("Check.ErrorCode", "ValidateProduct205Policy.Result.ErrorCode");
    check.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(map205);

    var review = eSpace.ServerActions.Named("ReviewProduct205Offer");
    review.Description = "Read-only exact Product205 eligibility and bank quote validation. Funding uses Alan's separately journaled demo DepositCash workaround; normal monthly servicing is not available.";
    var reviewReady = review.Nodes.OfType<IAssignNode>().Single(n => n.Label == "InterestRepaymentContractRequired");
    reviewReady.Assignments.ToList().ForEach(a => a.Delete()); reviewReady.Label = "Product205QuoteVerified";
    reviewReady.CreateAssignment("Result.IsReady", "True"); reviewReady.CreateAssignment("Result.HttpStatus", "200");
    reviewReady.CreateAssignment("Result.ErrorCode", "\"\"");
    var preflight = eSpace.ServerActions.Named("ResolveAdvanceAcceptancePreflight");
    var reviewCall = preflight.Nodes.OfType<IExecuteServerActionNode>().Single(n => n.Name == "ReviewInterestBearingOffer");
    var blockedReview = reviewCall.Target;
    var ready205 = preflight.CreateNode<IIfNode>(); ready205.Label = "Product205QuoteReady";
    ready205.SetCondition("ReviewInterestBearingOffer.Result.IsReady"); reviewCall.Target = ready205;
    ready205.FalseTarget = blockedReview;
    ready205.TrueTarget = preflight.Nodes.OfType<IExecuteServerActionNode>().Single(n => n.Name == "BuildAcceptanceBankHeader");
    preflight.Nodes.OfType<IIfNode>().Single(n => n.Label == "BankTermsMatchOffer").SetCondition(
        "ReadCurrentBankTerms.ObservedHttpStatus = 200 and ReadCurrentBankTerms.ObservedPlanFields = 1 and ReadCurrentBankTerms.Response.MaturityDate = ReadAcceptanceEligibility.Response.MaturityDate and ((ReadAcceptanceEligibility.Response.TBankLoanProductId = 205 and Abs(ReadCurrentBankTerms.Response.MonthlyInstalment - ReadAcceptanceEligibility.Response.MonthlyInstalment) <= 0.000001 and Abs(ReadCurrentBankTerms.Response.InterestRate - ReadAcceptanceEligibility.Response.InterestRate) <= 0.000001 and Abs(ReadCurrentBankTerms.Response.Interest - ReadAcceptanceEligibility.Response.Interest) <= 0.000001) or (ReadAcceptanceEligibility.Response.TBankLoanProductId = 207 and ReadCurrentBankTerms.Response.InterestRate = 0 and ReadCurrentBankTerms.Response.Interest = 0 and Round(ReadCurrentBankTerms.Response.MonthlyInstalment, 2) = ReadAcceptanceEligibility.Response.MonthlyInstalment))");
    var stage = eSpace.ServerActions.Named("StageAcceptancePlan");
    var persistTerms = stage.Nodes.OfType<IAssignNode>().Single(n => n.Label == "PersistAcceptanceReadiness");
    persistTerms.CreateAssignment("Operation.QuotedInterestRate", "Preflight.Eligibility.InterestRate");
    persistTerms.CreateAssignment("Operation.QuotedTotalInterest", "Preflight.Eligibility.Interest");
    persistTerms.CreateAssignment("Operation.QuotedMonthlyInstalment", "Preflight.Eligibility.MonthlyInstalment");
    persistTerms.CreateAssignment("Operation.QuotedMaturityDate", "Preflight.Eligibility.MaturityDate");

    var begin = eSpace.ServerActions.Named("BeginAcceptanceDispatch");
    var context = begin.Nodes.OfType<IIfNode>().Single(n => n.Label == "ValidCheckpointContext");
    context.SetCondition("IdentifierToInteger(AuthenticatedUserId) > 0 and OperationId <> NullIdentifier() and ExpectedVersion > 0 and ExpectedVersion < 2147483647 and (Step = \"BANK_APPLY\" or Step = \"BANK_APPROVE\" or Step = \"BANK_DEMO_DEPOSIT\")");
    begin.Nodes.OfType<IIfNode>().Single(n => n.Label == "SafeCheckpointState").SetCondition(
        "not Operation.RequestDispatched and not Operation.NeedsReconciliation and Operation.PrerequisitesVerified and Operation.OtpVerifiedAt <> NullDate() and Operation.PlanValidUntil > CurrDateTime() and Operation.OfferDate = CurrDate() and (Operation.LoanProductId = 207 or Operation.LoanProductId = 205) and Operation.CompoundBasis = \"Monthly\" and Trim(Operation.TBankCustomerId) <> \"\" and Trim(Operation.SettlementAccountId) <> \"\" and Trim(Operation.FeeAccountId) <> \"\" and ((Step = \"BANK_APPLY\" and Operation.Status = \"READY_TO_APPLY\" and Trim(Operation.LoanAccountId) = \"\") or (Step = \"BANK_APPROVE\" and Operation.Status = \"READY_TO_APPROVE\" and Operation.SimulationRecorded and Trim(Operation.LoanAccountId) <> \"\") or (Step = \"BANK_DEMO_DEPOSIT\" and Operation.LoanProductId = 205 and Operation.Status = \"APPROVAL_RECORDED\" and Operation.ApprovalRecorded and Trim(Operation.LoanAccountId) <> \"\" and not Operation.DemoFundingRecorded and Operation.DemoFundingDispatchedAt = NullDate() and Operation.QuotedMaturityDate = AddMonths(CurrDate(), Operation.Months)))");
    var checkpoint = begin.Nodes.OfType<IAssignNode>().Single(n => n.Label == "SetCheckpointState");
    checkpoint.Assignments.Single(a => a.Variable.ToString().StartsWith("Operation.Status ")).SetValue("If(Step = \"BANK_APPLY\", \"APPLY_IN_FLIGHT\", If(Step = \"BANK_APPROVE\", \"APPROVAL_IN_FLIGHT\", \"DEPOSIT_IN_FLIGHT\"))");
    checkpoint.CreateAssignment("Operation.DemoFundingDispatchedAt", "If(Step = \"BANK_DEMO_DEPOSIT\", CurrDateTime(), Operation.DemoFundingDispatchedAt)");

    // Private orchestration: authenticate -> bind bank details -> durable dispatch
    // -> exactly one deposit attempt -> validate and commit receipt. No retry loop.
    var fund = eSpace.CreateServerAction("ExecuteDemoLoanFunding");
    fund.Description = "Product205 teaching-bank disbursement. Commits BANK_DEMO_DEPOSIT before one DepositCash call; missing/unknown receipts retain the checkpoint for manual reconciliation. Never reissues a dispatched deposit.";
    fund.CreateInputParameter("Authorization").DataType = eSpace.TextType;
    fund.CreateInputParameter("OperationId").DataType = journal.IdentifierType;
    fund.CreateInputParameter("ExpectedVersion").DataType = eSpace.IntegerType;
    fund.CreateOutputParameter("Result").DataType = operationResult;
    fund.CreateLocalVariable("Operation").DataType = journal;
    fund.CreateLocalVariable("Snapshot").DataType = journal;
    fund.CreateLocalVariable("EmptyResult").DataType = operationResult;
    fund.CreateLocalVariable("Dispatched").DataType = eSpace.BooleanType;
    fund.CreateLocalVariable("DispatchVersion").DataType = eSpace.IntegerType;
    fund.CreateLocalVariable("Request").DataType = depositRequest;

    Func<string, IActionSignature, string[], IExecuteServerActionNode> call = (name, action, args) => {
        var node = fund.CreateNode<IExecuteServerActionNode>(name); node.Action = action;
        for (int i = 0; i < args.Length; i += 2) node.SetArgumentValue(action.InputParameters.Named(args[i]), args[i + 1]);
        return node;
    };
    Func<string, string[], IAssignNode> assign = (label, pairs) => {
        var node = fund.CreateNode<IAssignNode>(); node.Label = label;
        for (int i = 0; i < pairs.Length; i += 2) node.CreateAssignment(pairs[i], pairs[i + 1]);
        return node;
    };
    // A failed preflight releases its read transaction. A failed external call
    // rolls back only post-checkpoint work; the committed dispatch remains.
    Func<IActionNode, string, string, string, IIfNode> require = (previous, condition, code, status) => {
        var test = fund.CreateNode<IIfNode>(); test.SetCondition(condition);
        if (previous is IExecuteServerActionNode) ((IExecuteServerActionNode)previous).Target = test;
        else if (previous is IAggregateNode) ((IAggregateNode)previous).Target = test;
        var rollback = call("AbortFundingRead", system.ServerActions.Named("AbortTransaction"), new string[] {});
        test.FalseTarget = rollback;
        var failure = assign(code, new[] { "Result", "EmptyResult", "Result.HttpStatus", status, "Result.ErrorCode", "\"" + code + "\"" });
        rollback.Target = failure; fund.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(failure);
        return test;
    };
    var start = fund.CreateNode<OutSystems.Model.Logic.Nodes.IStartNode>();
    var owner = call("ValidateFundingOwner", eSpace.ServerActions.Named("ValidateAdvanceUser"), new[] { "Authorization", "Authorization" }); start.Target = owner;
    var ownerValid = require(owner, "ValidateFundingOwner.Caller.IsAuthenticated", "UNAUTHENTICATED", "401");
    var find = fund.CreateNode<IAggregateNode>("FindFundingOperation");
    find.AsDatabaseAggregate.CreateSource(journal);
    find.AsDatabaseAggregate.CreateFilter("AdvanceAcceptanceOperation.Id = OperationId and AdvanceAcceptanceOperation.UserId = ValidateFundingOwner.Caller.UserId");
    find.SetMaxRecords("1");
    ownerValid.TrueTarget = find;
    var exists = require(find, "not " + find.Name + ".List.Empty", "NOT_FOUND", "404");
    var load = assign("ReadFundingOperation", new[] { "Operation", find.Name + ".List.Current.AdvanceAcceptanceOperation", "Snapshot", find.Name + ".List.Current.AdvanceAcceptanceOperation" }); exists.TrueTarget = load;
    var replay = fund.CreateNode<IIfNode>(); replay.Label = "FundingAlreadyRecorded";
    replay.SetCondition("Operation.DemoFundingRecorded and Trim(Operation.DemoFundingTxnId) <> \"\" and not Operation.RequestDispatched and not Operation.NeedsReconciliation"); load.Target = replay;
    var replayResult = assign("ReturnRecordedFunding", new[] {
        "Result.Success", "True", "Result.HttpStatus", "200", "Result.OperationId", "IdentifierToLongInteger(Operation.Id)",
        "Result.Version", "Operation.StateVersion", "Result.Status", "Operation.Status", "Result.LoanAccountId", "Operation.LoanAccountId", "Result.TransactionId", "Operation.DemoFundingTxnId"
    }); replay.TrueTarget = replayResult; fund.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(replayResult);
    var uncertain = fund.CreateNode<IIfNode>(); uncertain.Label = "FundingMustNotBeRepeated";
    uncertain.SetCondition("Operation.RequestDispatched or Operation.NeedsReconciliation or Operation.DemoFundingDispatchedAt <> NullDate()"); replay.FalseTarget = uncertain;
    var pending = assign("ReturnFundingReconciliation", new[] {
        "Result.HttpStatus", "409", "Result.ErrorCode", "\"DEMO_FUNDING_RECONCILIATION_REQUIRED\"", "Result.OperationId", "IdentifierToLongInteger(Operation.Id)",
        "Result.Version", "Operation.StateVersion", "Result.Status", "Operation.Status", "Result.LoanAccountId", "Operation.LoanAccountId", "Result.NeedsReconciliation", "True", "Result.DispatchOutstanding", "Operation.RequestDispatched"
    }); uncertain.TrueTarget = pending; fund.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(pending);
    var contextValid = require(null, "Operation.StateVersion = ExpectedVersion and ExpectedVersion > 0 and ExpectedVersion < 2147483646 and Operation.LoanProductId = 205 and Operation.ApprovalRecorded and Operation.Status = \"APPROVAL_RECORDED\" and Operation.Amount > 0 and Round(Operation.Amount, 2) = Operation.Amount and Trim(Operation.LoanAccountId) <> \"\" and Operation.QuotedMaturityDate = AddMonths(CurrDate(), Operation.Months)", "DEMO_FUNDING_NOT_READY", "409");
    uncertain.FalseTarget = contextValid; uncertain.TrueTarget = pending;
    var header = call("BuildFundingBankHeader", core.ServerActions.Named("BuildTBankAuthHeader"), new[] { "TenantConfigId", "Entities.TenantConfig.SMUBank" }); contextValid.TrueTarget = header;
    var configured = require(header, "Trim(BuildFundingBankHeader.AuthHeaderValue) <> \"\"", "BANK_CONFIGURATION", "503");
    var details = call("ReadFundingLoanDetails", bank.Actions.Named("GetLoanAccountDetails"), new[] { "BankAuthorization", "BuildFundingBankHeader.AuthHeaderValue", "CustomerId", "Operation.TBankCustomerId", "LoanAccountId", "Operation.LoanAccountId" }); configured.TrueTarget = details;
    var bound = require(details,
        "ReadFundingLoanDetails.ObservedHttpStatus = 200 and ReadFundingLoanDetails.ObservedLoanFields = 7 and ReadFundingLoanDetails.Response.AccountId = Operation.LoanAccountId and ReadFundingLoanDetails.Response.CustomerId = Operation.TBankCustomerId and ReadFundingLoanDetails.Response.SettlementAccount = Operation.SettlementAccountId and ReadFundingLoanDetails.Response.Currency = \"SGD\" and ReadFundingLoanDetails.Response.CurrentStatus = \"Open\" and ReadFundingLoanDetails.Response.ProductId = 205 and ReadFundingLoanDetails.Response.DisburseAmount = Operation.Amount and ReadFundingLoanDetails.Response.Balance = Operation.Amount and ReadFundingLoanDetails.Response.LoanTerm = Operation.Months and Round(ReadFundingLoanDetails.Response.InstallmentAmount, 2) = Round(Operation.QuotedMonthlyInstalment, 2) and Abs(ReadFundingLoanDetails.Response.InterestRate - Operation.QuotedInterestRate) <= 0.000001 and TextToDateValidate(ReadFundingLoanDetails.Response.MaturityDate) and TextToDate(ReadFundingLoanDetails.Response.MaturityDate) = Operation.QuotedMaturityDate",
        "BANK_DETAILS_MISMATCH", "409");
    var worker = call("RevalidateFundingWorker", eSpace.ServerActions.Named("ValidateAdvanceWorker"), new[] { "Authorization", "Authorization" }); bound.TrueTarget = worker;
    var workerValid = require(worker, "RevalidateFundingWorker.Caller.IsAuthenticated and RevalidateFundingWorker.Caller.HttpStatus = 200 and RevalidateFundingWorker.Caller.ErrorCode = \"\" and RevalidateFundingWorker.Caller.UserId = Snapshot.UserId", "WORKER_PERMISSION_CONTRACT_PENDING", "503");
    var permission = call("CommitDemoDepositDispatch", begin, new[] { "AuthenticatedUserId", "ValidateFundingOwner.Caller.UserId", "OperationId", "OperationId", "ExpectedVersion", "ExpectedVersion", "Step", "\"BANK_DEMO_DEPOSIT\"" }); workerValid.TrueTarget = permission;
    var allowed = fund.CreateNode<IIfNode>(); allowed.Label = "DepositDispatchPermitted"; allowed.SetCondition("CommitDemoDepositDispatch.Result.Success and CommitDemoDepositDispatch.Result.CanDispatch"); permission.Target = allowed;
    var denied = assign("ReturnDepositBlocked", new[] { "Result", "CommitDemoDepositDispatch.Result", "Result.CanDispatch", "False" }); allowed.FalseTarget = denied; fund.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(denied);
    var map = assign("RememberDepositDispatch", new[] {
        "Dispatched", "True", "DispatchVersion", "CommitDemoDepositDispatch.Result.Version", "Request.AccountId", "Snapshot.SettlementAccountId", "Request.Amount", "Snapshot.Amount",
        "Request.Narrative", "\"RemitEase demo funding loan \" + Snapshot.LoanAccountId + \" op \" + LongIntegerToText(IdentifierToLongInteger(OperationId))"
    }); allowed.TrueTarget = map;
    var send = call("DepositPrincipalOnce", deposit, new[] { "BankAuthorization", "BuildFundingBankHeader.AuthHeaderValue", "CustomerId", "Snapshot.TBankCustomerId", "Request", "Request" }); map.Target = send;
    var receipt = fund.CreateNode<IIfNode>(); receipt.Label = "ExactDepositReceipt";
    receipt.SetCondition("DepositPrincipalOnce.ObservedHttpStatus = 200 and DepositPrincipalOnce.ObservedReceiptFields = 1 and DepositPrincipalOnce.Response.Errors.Empty and (DepositPrincipalOnce.Response.StatusCode = 0 or DepositPrincipalOnce.Response.StatusCode = 200) and Trim(DepositPrincipalOnce.Response.TransactionId) <> \"\" and DepositPrincipalOnce.Response.TransactionId = Trim(DepositPrincipalOnce.Response.TransactionId) and Length(DepositPrincipalOnce.Response.TransactionId) <= 100 and Round(DepositPrincipalOnce.Response.BalanceBefore, 2) = DepositPrincipalOnce.Response.BalanceBefore and Round(DepositPrincipalOnce.Response.BalanceAfter, 2) = DepositPrincipalOnce.Response.BalanceAfter and DepositPrincipalOnce.Response.BalanceAfter - DepositPrincipalOnce.Response.BalanceBefore = Snapshot.Amount"); send.Target = receipt;
    var unknown = assign("ReturnUnknownDeposit", new[] {
        "Result", "EmptyResult", "Result.HttpStatus", "502", "Result.ErrorCode", "\"DEMO_FUNDING_RECONCILIATION_REQUIRED\"", "Result.OperationId", "IdentifierToLongInteger(OperationId)",
        "Result.Version", "DispatchVersion", "Result.Status", "\"DEPOSIT_IN_FLIGHT\"", "Result.LoanAccountId", "Snapshot.LoanAccountId", "Result.NeedsReconciliation", "True", "Result.DispatchOutstanding", "True"
    }); receipt.FalseTarget = unknown; fund.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(unknown);
    var lockReceipt = call("LockFundingReceipt", journal.GetForUpdateAction, new[] { "Id", "OperationId" }); receipt.TrueTarget = lockReceipt;
    var reload = assign("ReloadFundingReceipt", new[] { "Operation", "LockFundingReceipt.Record.AdvanceAcceptanceOperation" }); lockReceipt.Target = reload;
    var fence = fund.CreateNode<IIfNode>(); fence.Label = "DepositReceiptFence";
    fence.SetCondition("Operation.StateVersion = DispatchVersion and Operation.UserId = Snapshot.UserId and Operation.LoanProductId = 205 and Operation.ApprovalRecorded and Operation.Status = \"DEPOSIT_IN_FLIGHT\" and Operation.DispatchStage = \"BANK_DEMO_DEPOSIT\" and Operation.RequestDispatched and Operation.NeedsReconciliation and not Operation.DemoFundingRecorded and Operation.DemoFundingDispatchedAt <> NullDate() and Operation.LoanAccountId = Snapshot.LoanAccountId and Operation.TBankCustomerId = Snapshot.TBankCustomerId and Operation.SettlementAccountId = Snapshot.SettlementAccountId and Operation.Amount = Snapshot.Amount and Operation.QuotedMaturityDate = Snapshot.QuotedMaturityDate"); reload.Target = fence;
    var abortReceipt = call("AbortUnstoredReceipt", system.ServerActions.Named("AbortTransaction"), new string[] {}); fence.FalseTarget = abortReceipt; abortReceipt.Target = unknown;
    var store = assign("RecordDemoFundingReceipt", new[] {
        "Operation.DemoFundingRecorded", "True", "Operation.DemoFundingTxnId", "DepositPrincipalOnce.Response.TransactionId", "Operation.DemoFundingBalanceBefore", "DepositPrincipalOnce.Response.BalanceBefore", "Operation.DemoFundingBalanceAfter", "DepositPrincipalOnce.Response.BalanceAfter",
        "Operation.DemoFundingDate", "DateTimeToDate(Operation.DemoFundingDispatchedAt)", "Operation.Status", "\"APPROVAL_RECORDED\"", "Operation.RequestDispatched", "False", "Operation.NeedsReconciliation", "False", "Operation.LastErrorCode", "\"\"", "Operation.StateVersion", "Operation.StateVersion + 1", "Operation.UpdatedAt", "CurrDateTime()"
    }); fence.TrueTarget = store;
    var save = call("SaveDemoFundingReceipt", journal.UpdateAction, new[] { "Source", "Operation" }); store.Target = save;
    var commit = call("CommitDemoFundingReceipt", system.ServerActions.Named("CommitTransaction"), new string[] {}); save.Target = commit; commit.Target = replayResult;
    var handler = fund.CreateNode<OutSystems.Model.Logic.Nodes.IExceptionHandlerNode>("DemoFundingFailure"); handler.Exception = eSpace.AllExceptions; handler.AbortTransaction = false; handler.LogError = false;
    var rollbackFailure = call("AbortFundingFailure", system.ServerActions.Named("AbortTransaction"), new string[] {}); handler.Target = rollbackFailure;
    var hadDispatch = fund.CreateNode<IIfNode>(); hadDispatch.SetCondition("Dispatched"); rollbackFailure.Target = hadDispatch;
    // Exception-handler branches have their own ends, separate from the main flow.
    foreach (var wasDispatched in new[] { true, false }) {
        var failure = assign(wasDispatched ? "UnknownDepositFailure" : "FundingPreflightFailure", wasDispatched ? new[] {
            "Result.HttpStatus", "502", "Result.ErrorCode", "\"DEMO_FUNDING_RECONCILIATION_REQUIRED\"", "Result.OperationId", "IdentifierToLongInteger(OperationId)", "Result.Version", "DispatchVersion", "Result.Status", "\"DEPOSIT_IN_FLIGHT\"", "Result.LoanAccountId", "Snapshot.LoanAccountId", "Result.NeedsReconciliation", "True", "Result.DispatchOutstanding", "True"
        } : new[] { "Result.HttpStatus", "503", "Result.ErrorCode", "\"DEMO_FUNDING_PREFLIGHT_UNAVAILABLE\"" });
        if (wasDispatched) hadDispatch.TrueTarget = failure; else hadDispatch.FalseTarget = failure;
        fund.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(failure);
    }

    // Resume only after approval (and before activation). Already-recorded deposits
    // return their receipt; dispatched/uncertain deposits never reach the bank again.
    var resume = eSpace.ServerActions.Named("ResumeAdvanceAcceptance");
    resume.CreateLocalVariable("FundingResult").DataType = operationResult;
    var approvalDone = resume.Nodes.OfType<IIfNode>().Single(n => n.Label == "AcceptanceWasCompleted");
    var oldProof = approvalDone.FalseTarget;
    var fundCall = resume.CreateNode<IExecuteServerActionNode>("FundApprovedDemoLoan"); fundCall.Action = fund;
    fundCall.SetArgumentValue(fund.InputParameters.Named("Authorization"), "Authorization");
    fundCall.SetArgumentValue(fund.InputParameters.Named("OperationId"), "OperationId");
    fundCall.SetArgumentValue(fund.InputParameters.Named("ExpectedVersion"), "ResumeKnownLoanApproval.Result.Version");
    // Legacy207 has no demo deposit. The funding action is selected by an owned
    // journal read, not by browser-supplied product or account identifiers.
    var productRead = resume.CreateNode<IAggregateNode>("ReadResumeFundingProduct");
    productRead.AsDatabaseAggregate.CreateSource(journal); productRead.AsDatabaseAggregate.CreateFilter("AdvanceAcceptanceOperation.Id = OperationId"); productRead.SetMaxRecords("1");
    var initialFundingResult = resume.CreateNode<IAssignNode>(); initialFundingResult.Label = "RememberApprovalForFunding";
    initialFundingResult.CreateAssignment("FundingResult", "ResumeKnownLoanApproval.Result");
    approvalDone.FalseTarget = initialFundingResult; initialFundingResult.Target = productRead;
    var isDemo = resume.CreateNode<IIfNode>(); isDemo.SetCondition("not " + productRead.Name + ".List.Empty and " + productRead.Name + ".List.Current.AdvanceAcceptanceOperation.LoanProductId = 205"); productRead.Target = isDemo;
    isDemo.TrueTarget = fundCall; isDemo.FalseTarget = oldProof;
    var funded = resume.CreateNode<IIfNode>(); funded.Label = "DemoFundingReceiptReady"; funded.SetCondition("FundApprovedDemoLoan.Result.Success and not FundApprovedDemoLoan.Result.NeedsReconciliation and not FundApprovedDemoLoan.Result.DispatchOutstanding"); fundCall.Target = funded;
    var rememberFunding = resume.CreateNode<IAssignNode>(); rememberFunding.Label = "RememberFundingReceiptVersion";
    rememberFunding.CreateAssignment("FundingResult", "FundApprovedDemoLoan.Result"); funded.TrueTarget = rememberFunding; rememberFunding.Target = oldProof;
    var returnFunding = resume.CreateNode<IAssignNode>(); returnFunding.Label = "ReturnDemoFundingPending"; returnFunding.CreateAssignment("Result", "FundApprovedDemoLoan.Result"); returnFunding.CreateAssignment("Result.CanDispatch", "False"); funded.FalseTarget = returnFunding;
    resume.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(returnFunding);
    foreach (var n in resume.Nodes.OfType<IExecuteServerActionNode>().Where(n => n.Name == "ActivateConfirmedAdvanceLedger"))
        n.SetArgumentValue(n.Action.InputParameters.Named("ExpectedVersion"), "FundingResult.Version");
    var pendingBankResult = resume.Nodes.OfType<IAssignNode>().Single(n => n.Label == "ReturnActualBankPendingState");
    pendingBankResult.Assignments.Single(a => a.Variable.ToString().StartsWith("Result ")).SetValue("FundingResult");

    // The workaround is a cash-deposit receipt, not a native type403 disbursement.
    var proof = eSpace.ServerActions.Named("ReadAcceptanceDisbursementProof");
    var knownDetails = proof.Nodes.OfType<IIfNode>().Single(n => n.Label == "KnownLoanDetailsBound");
    var chooseProof = proof.CreateNode<IIfNode>(); chooseProof.Label = "Product205DemoReceipt"; chooseProof.SetCondition("Operation.LoanProductId = 205");
    var preceding = proof.Nodes.Single(n => n.Connectors.Any(c => c.Target == knownDetails));
    foreach (var connector in preceding.Connectors.Where(c => c.Target == knownDetails)) connector.Target = chooseProof;
    chooseProof.FalseTarget = knownDetails;
    var receiptProof = proof.CreateNode<IIfNode>(); receiptProof.Label = "RecordedDemoFundingBound";
    receiptProof.SetCondition("CheckKnownLoanDetails.Check.IsConsistent and ReadKnownLoanDetails.Response.CurrentStatus = \"Open\" and ReadKnownLoanDetails.Response.ProductId = 205 and ReadKnownLoanDetails.Response.DisburseAmount = Operation.Amount and Abs(ReadKnownLoanDetails.Response.InterestRate - Operation.QuotedInterestRate) <= 0.000001 and TextToDateValidate(ReadKnownLoanDetails.Response.MaturityDate) and TextToDate(ReadKnownLoanDetails.Response.MaturityDate) = Operation.QuotedMaturityDate and Operation.DemoFundingRecorded and Operation.DemoFundingDispatchedAt <> NullDate() and Operation.DemoFundingDate = DateTimeToDate(Operation.DemoFundingDispatchedAt) and Operation.DemoFundingDate >= Operation.OfferDate and Operation.DemoFundingDate <= CurrDate() and Operation.QuotedMaturityDate = AddMonths(Operation.DemoFundingDate, Operation.Months) and Trim(Operation.DemoFundingTxnId) <> \"\" and Operation.DemoFundingBalanceAfter - Operation.DemoFundingBalanceBefore = Operation.Amount"); chooseProof.TrueTarget = receiptProof;
    receiptProof.FalseTarget = knownDetails.FalseTarget;
    var verifiedDemo = proof.CreateNode<IAssignNode>(); verifiedDemo.Label = "ReturnVerifiedDemoFunding";
    foreach (var pair in new[] { new[] { "IsConfirmed", "True" }, new[] { "UserId", "Operation.UserId" }, new[] { "LoanAccountId", "Operation.LoanAccountId" }, new[] { "TBankCustomerId", "Operation.TBankCustomerId" }, new[] { "SettlementAccountId", "Operation.SettlementAccountId" }, new[] { "Amount", "Operation.Amount" }, new[] { "DisbursementDate", "Operation.DemoFundingDate" }, new[] { "MaturityDate", "Operation.QuotedMaturityDate" }, new[] { "TransactionId", "Operation.DemoFundingTxnId" } }) verifiedDemo.CreateAssignment("Result." + pair[0], pair[1]);
    receiptProof.TrueTarget = verifiedDemo; proof.CreateNode<OutSystems.Model.Logic.Nodes.IEndNode>().ConnectedBelow(verifiedDemo);
    var finalizer = eSpace.ServerActions.Named("FinalizeAcceptedAdvance");
    var activationSafe = finalizer.Nodes.OfType<IIfNode>().Single(n => n.Label == "ActivationClaimSafe");
    var existingSafe = activationSafe.Condition.ToString(); existingSafe = existingSafe.Substring(0, existingSafe.IndexOf(" ["));
    activationSafe.SetCondition("(" + existingSafe + ") and (Operation.LoanProductId <> 205 or (Operation.DemoFundingRecorded and Operation.DemoFundingTxnId = Proof.TransactionId and Operation.DemoFundingDate = Proof.DisbursementDate and Operation.DemoFundingBalanceAfter - Operation.DemoFundingBalanceBefore = Proof.Amount))");
    var eventMessage = finalizer.Nodes.OfType<IAssignNode>().Single(n => n.Label == "BuildStableAdvanceEvent").Assignments.Single(a => a.Variable.ToString().StartsWith("Event.Message "));
    eventMessage.SetValue("\"Your advance is active. View your advance details.\"");

    // Disable the monthly batch at its authenticated entry point. A site-property
    // toggle or a manual timer wake must not turn early repayments into instalments.
    // Retain the old path for a future supported bank batch contract.
    var batch = eSpace.ServerActions.Named("CollectAdvanceRepayments");
    batch.Description = "Normal monthly collection is unavailable: Alan confirmed tBank's batch is not running. Authorized requests return503 MONTHLY_COLLECTION_UNAVAILABLE without any repayment dispatch. Early repayment is a separate quoted flow.";
    batch.Nodes.OfType<IIfNode>().Single(n => n.Label == "CollectionBatchAuthorized").SetCondition("AuthorizeCollectionBatch.Result.IsAuthorizedCollector and False");
    var unavailable = batch.Nodes.OfType<IAssignNode>().Single(n => n.Label == "FORBIDDEN");
    unavailable.Assignments.Single(a => a.Variable.ToString().StartsWith("Result.HttpStatus ")).SetValue("If(AuthorizeCollectionBatch.Result.IsAuthorizedCollector, 503, If(AuthorizeCollectionBatch.Result.HttpStatus = 401, 401, If(AuthorizeCollectionBatch.Result.HttpStatus = 403, 403, 503)))");
    unavailable.Assignments.Single(a => a.Variable.ToString().StartsWith("Result.ErrorCode ")).SetValue("If(AuthorizeCollectionBatch.Result.IsAuthorizedCollector, \"MONTHLY_COLLECTION_UNAVAILABLE\", If(AuthorizeCollectionBatch.Result.HttpStatus = 401, \"UNAUTHENTICATED\", If(AuthorizeCollectionBatch.Result.HttpStatus = 403, \"FORBIDDEN\", \"COLLECTOR_ACCESS_UNAVAILABLE\")))");
    foreach (var timer in eSpace.Timers.Where(t => t.Name == "TMR_AdvanceRepayments")) timer.Schedule = "";

    // Every touched action gets a complete reachable-node and handler layout pass.
    foreach (var act in new[] { check, review, preflight, stage, begin, fund, resume, proof, finalizer, batch }) {
        var depth = new Dictionary<IActionNode, int>(); var columns = new Dictionary<IActionNode, int>(); var queue = new Queue<IActionNode>();
        var first = act.Nodes.OfType<OutSystems.Model.Logic.Nodes.IStartNode>().Single(); depth[first] = 0; columns[first] = 0; queue.Enqueue(first);
        int nextBranchColumn = 1;
        while (queue.Count > 0) {
            var current = queue.Dequeue();
            foreach (var connector in current.Connectors) {
                var next = connector.Target; if (next == null || depth.ContainsKey(next)) continue;
                var iff = current as IIfNode; var loop = current as IForEachNode;
                bool side = (iff != null && next == iff.FalseTarget) || (loop != null && next == loop.CycleTarget);
                depth[next] = depth[current] + 1; columns[next] = side ? nextBranchColumn++ : columns[current]; queue.Enqueue(next);
            }
        }
        int handlerColumn = columns.Values.Max() + 2;
        foreach (var flowHandler in act.Nodes.OfType<OutSystems.Model.Logic.Nodes.IExceptionHandlerNode>()) {
            var hq = new Queue<IActionNode>(); depth[flowHandler] = 0; columns[flowHandler] = handlerColumn; hq.Enqueue(flowHandler);
            while (hq.Count > 0) {
                var current = hq.Dequeue();
                foreach (var connector in current.Connectors) { var next = connector.Target; if (next == null || depth.ContainsKey(next)) continue; depth[next] = depth[current] + 1; columns[next] = columns[current] + (current is IIfNode && next == ((IIfNode)current).FalseTarget ? 1 : 0); hq.Enqueue(next); }
            }
            handlerColumn += 2;
        }
        foreach (var node in depth.Keys) { node.HorizontalPosition = 3200 + columns[node] * 2300; node.VerticalPosition = 800 + depth[node] * 1400; }
    }
}
