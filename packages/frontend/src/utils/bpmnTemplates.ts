/**
 * Default BPMN diagram template
 * Uses camunda namespace for Operaton compatibility
 */
export const DEFAULT_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn" 
                  id="Definitions_1" 
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="180">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="173" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * AWB General Administrative Law Act - Generic Shell Process
 * Demonstrates the 8-phase AWB procedural shell with Call Activity,
 * completeness check DMN, and Archives Act archiving DMN.
 * Source: examples/Flevoland/awb-process.bpmn
 * Tested in Operaton Cockpit - Working
 */
export const AWB_PROCESS_EXAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_AWB" targetNamespace="http://example.com/awb" exporter="Camunda Modeler" exporterVersion="5.43.1">
  <bpmn:process id="AwbShellProcess" name="AWB General Administrative Law Act - Generic Process" isExecutable="true" camunda:historyTimeToLive="365">
    <bpmn:startEvent id="StartEvent_AWB" name="Application submitted" camunda:formKey="embedded:deployment:start-form.html">
      <bpmn:outgoing>Flow_Start_Phase1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:scriptTask id="Task_Phase1_Identity" name="Phase 1: Determine legal relationship (identification)" scriptFormat="javascript">
      <bpmn:incoming>Flow_Start_Phase1</bpmn:incoming>
      <bpmn:outgoing>Flow_Phase1_Phase2</bpmn:outgoing>
      <bpmn:script>
        // Phase 1: Record identity and authentication
        // In production: integrate with DigiD / eHerkenning
        var now = new Date().toISOString();
        execution.setVariable("applicationDate", now);
        execution.setVariable("applicationYear", new Date().getFullYear());

        if (!execution.getVariable("applicantId")) {
          execution.setVariable("applicantId", "APPLICANT-" + Date.now());
        }
        if (!execution.getVariable("productType")) {
          execution.setVariable("productType", "TreeFellingPermit");
        }

        execution.setVariable("phase1Complete", true);
        execution.setVariable("authenticationMethod", "DigiD");
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:scriptTask id="Task_Phase2_Receipt" name="Phase 2: Application receipt acknowledgement (Awb 4:1)" scriptFormat="javascript">
      <bpmn:incoming>Flow_Phase1_Phase2</bpmn:incoming>
      <bpmn:outgoing>Flow_Phase2_Phase3</bpmn:outgoing>
      <bpmn:script>
        // Phase 2: Acknowledge receipt of application (Awb 4:1)
        var receiptDate = new Date();
        execution.setVariable("receiptDate", receiptDate.toISOString());

        // Statutory deadline: Awb 4:13 - 8 weeks standard
        var deadline = new Date(receiptDate);
        deadline.setDate(deadline.getDate() + 56);
        execution.setVariable("awbDeadlineDate", deadline.toISOString());
        execution.setVariable("awbDeadlineDays", 56);
        execution.setVariable("awbLegalBasis", "Awb 4:13 paragraph 1");

        var ref = "AWB-" + receiptDate.getFullYear() + "-" + Date.now().toString().slice(-6);
        execution.setVariable("dossierReference", ref);

        execution.setVariable("phase2Complete", true);
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:businessRuleTask id="Task_Phase3_Completeness" name="Phase 3: Admissibility check (Awb 2:3)" camunda:resultVariable="completenessResult" camunda:decisionRef="AwbCompletenessCheck" camunda:mapDecisionResult="singleResult">
      <bpmn:incoming>Flow_Phase2_Phase3</bpmn:incoming>
      <bpmn:outgoing>Flow_Phase3_Gateway</bpmn:outgoing>
    </bpmn:businessRuleTask>
    <bpmn:exclusiveGateway id="Gateway_Complete" name="Application complete?">
      <bpmn:incoming>Flow_Phase3_Gateway</bpmn:incoming>
      <bpmn:outgoing>Flow_Complete_Yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_Complete_No</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:userTask id="Task_RequestMissingInfo" name="Request missing information (Awb 4:5)" camunda:formKey="embedded:deployment:awb-missing-info-form.html" camunda:assignee="demo">
      <bpmn:incoming>Flow_Complete_No</bpmn:incoming>
      <bpmn:outgoing>Flow_MissingInfo_Recheck</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_StillIncomplete" name="Supplement received?">
      <bpmn:incoming>Flow_MissingInfo_Recheck</bpmn:incoming>
      <bpmn:outgoing>Flow_Recheck_Process</bpmn:outgoing>
      <bpmn:outgoing>Flow_Recheck_Refuse</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:scriptTask id="Task_RefuseToProcess" name="Refuse to process application (Awb 4:5 paragraph 2)" scriptFormat="javascript">
      <bpmn:incoming>Flow_Recheck_Refuse</bpmn:incoming>
      <bpmn:outgoing>Flow_Refuse_Notify</bpmn:outgoing>
      <bpmn:script>
        execution.setVariable("status", "Not admissible");
        execution.setVariable("finalMessage", "Your application has not been processed due to missing information (Awb 4:5 paragraph 2).");
        execution.setVariable("decisionType", "Refused");
        execution.setVariable("replacementInfo", "N/A");
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:callActivity id="Task_Phase45_Process" name="Phase 4+5: Processing and Decision" calledElement="TreeFellingPermitSubProcess">
      <bpmn:extensionElements>
        <camunda:in variables="all" />
        <camunda:out variables="all" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_Complete_Yes</bpmn:incoming>
      <bpmn:incoming>Flow_Recheck_Process</bpmn:incoming>
      <bpmn:outgoing>Flow_Phase45_Phase6</bpmn:outgoing>
    </bpmn:callActivity>
    <bpmn:userTask id="Task_Phase6_Notify" name="Phase 6: Notify applicant of decision (Awb 3:6)" camunda:formKey="embedded:deployment:inform-applicant-form.html" camunda:assignee="demo">
      <bpmn:incoming>Flow_Phase45_Phase6</bpmn:incoming>
      <bpmn:incoming>Flow_Refuse_Notify</bpmn:incoming>
      <bpmn:outgoing>Flow_Phase6_PaymentGateway</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_Payment" name="Payment required?">
      <bpmn:incoming>Flow_Phase6_PaymentGateway</bpmn:incoming>
      <bpmn:outgoing>Flow_Payment_Yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_Payment_No</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:scriptTask id="Task_Phase7_Payment" name="Phase 7: Process payment (Collection Act)" scriptFormat="javascript">
      <bpmn:incoming>Flow_Payment_Yes</bpmn:incoming>
      <bpmn:outgoing>Flow_PaymentTask_Chain</bpmn:outgoing>
      <bpmn:script>
        // In production: integrate with payment provider / iDEAL
        execution.setVariable("paymentProcessed", true);
        execution.setVariable("paymentDate", new Date().toISOString());
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:exclusiveGateway id="Gateway_Chain" name="Forward to chain process?">
      <bpmn:incoming>Flow_Payment_No</bpmn:incoming>
      <bpmn:incoming>Flow_PaymentTask_Chain</bpmn:incoming>
      <bpmn:outgoing>Flow_Chain_Yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_Chain_No</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:scriptTask id="Task_Phase8_Forward" name="Phase 8: Forward to chain process" scriptFormat="javascript">
      <bpmn:incoming>Flow_Chain_Yes</bpmn:incoming>
      <bpmn:outgoing>Flow_ChainTask_Archives</bpmn:outgoing>
      <bpmn:script>
        // In production: call external service / API
        execution.setVariable("chainForwardDate", new Date().toISOString());
        execution.setVariable("chainForwardComplete", true);
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:businessRuleTask id="Task_ArchivesDMN" name="Archiving: retention and destruction period (Archives Act)" camunda:resultVariable="archivingResult" camunda:decisionRef="ArchivesActRetention" camunda:mapDecisionResult="singleResult">
      <bpmn:incoming>Flow_Chain_No</bpmn:incoming>
      <bpmn:incoming>Flow_ChainTask_Archives</bpmn:incoming>
      <bpmn:outgoing>Flow_ArchivesDMN_Record</bpmn:outgoing>
    </bpmn:businessRuleTask>
    <bpmn:scriptTask id="Task_ArchiveRecord" name="Archive dossier" scriptFormat="javascript">
      <bpmn:incoming>Flow_ArchivesDMN_Record</bpmn:incoming>
      <bpmn:outgoing>Flow_Archive_End</bpmn:outgoing>
      <bpmn:script>
        var result = execution.getVariable("archivingResult");
        if (result) {
          execution.setVariable("retentionYears", result.retentionYears);
          execution.setVariable("retentionClass", result.retentionClass);
          execution.setVariable("archivingLegalBasis", result.legalBasis);
          execution.setVariable("destroyable", result.destroyable);

          var destroyDate = new Date();
          destroyDate.setFullYear(destroyDate.getFullYear() + parseInt(result.retentionYears));
          execution.setVariable("destroyAfterDate", destroyDate.toISOString().substring(0, 10));
        }
        execution.setVariable("archiveDate", new Date().toISOString());
        execution.setVariable("archiveComplete", true);
      </bpmn:script>
    </bpmn:scriptTask>
    <bpmn:endEvent id="EndEvent_AWB" name="Dossier closed">
      <bpmn:incoming>Flow_Archive_End</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Start_Phase1" sourceRef="StartEvent_AWB" targetRef="Task_Phase1_Identity" />
    <bpmn:sequenceFlow id="Flow_Phase1_Phase2" sourceRef="Task_Phase1_Identity" targetRef="Task_Phase2_Receipt" />
    <bpmn:sequenceFlow id="Flow_Phase2_Phase3" sourceRef="Task_Phase2_Receipt" targetRef="Task_Phase3_Completeness" />
    <bpmn:sequenceFlow id="Flow_Phase3_Gateway" sourceRef="Task_Phase3_Completeness" targetRef="Gateway_Complete" />
    <bpmn:sequenceFlow id="Flow_Complete_Yes" sourceRef="Gateway_Complete" targetRef="Task_Phase45_Process">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${completenessResult.isComplete == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Complete_No" sourceRef="Gateway_Complete" targetRef="Task_RequestMissingInfo">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${completenessResult.isComplete == false}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_MissingInfo_Recheck" sourceRef="Task_RequestMissingInfo" targetRef="Gateway_StillIncomplete" />
    <bpmn:sequenceFlow id="Flow_Recheck_Process" sourceRef="Gateway_StillIncomplete" targetRef="Task_Phase45_Process">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${supplementReceived == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Recheck_Refuse" sourceRef="Gateway_StillIncomplete" targetRef="Task_RefuseToProcess">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${supplementReceived == false}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Refuse_Notify" sourceRef="Task_RefuseToProcess" targetRef="Task_Phase6_Notify" />
    <bpmn:sequenceFlow id="Flow_Phase45_Phase6" sourceRef="Task_Phase45_Process" targetRef="Task_Phase6_Notify" />
    <bpmn:sequenceFlow id="Flow_Phase6_PaymentGateway" sourceRef="Task_Phase6_Notify" targetRef="Gateway_Payment" />
    <bpmn:sequenceFlow id="Flow_Payment_Yes" sourceRef="Gateway_Payment" targetRef="Task_Phase7_Payment">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${paymentRequired == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Payment_No" sourceRef="Gateway_Payment" targetRef="Gateway_Chain">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${paymentRequired != true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_PaymentTask_Chain" sourceRef="Task_Phase7_Payment" targetRef="Gateway_Chain" />
    <bpmn:sequenceFlow id="Flow_Chain_Yes" sourceRef="Gateway_Chain" targetRef="Task_Phase8_Forward">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${chainProcessRequired == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Chain_No" sourceRef="Gateway_Chain" targetRef="Task_ArchivesDMN">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${chainProcessRequired != true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_ChainTask_Archives" sourceRef="Task_Phase8_Forward" targetRef="Task_ArchivesDMN" />
    <bpmn:sequenceFlow id="Flow_ArchivesDMN_Record" sourceRef="Task_ArchivesDMN" targetRef="Task_ArchiveRecord" />
    <bpmn:sequenceFlow id="Flow_Archive_End" sourceRef="Task_ArchiveRecord" targetRef="EndEvent_AWB" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_AWB">
    <bpmndi:BPMNPlane id="BPMNPlane_AWB" bpmnElement="AwbShellProcess">
      <bpmndi:BPMNShape id="StartEvent_AWB_di" bpmnElement="StartEvent_AWB">
        <dc:Bounds x="160" y="299" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="151" y="342" width="54" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase1_Identity_di" bpmnElement="Task_Phase1_Identity">
        <dc:Bounds x="246" y="277" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase2_Receipt_di" bpmnElement="Task_Phase2_Receipt">
        <dc:Bounds x="466" y="277" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase3_Completeness_di" bpmnElement="Task_Phase3_Completeness">
        <dc:Bounds x="686" y="277" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_Complete_di" bpmnElement="Gateway_Complete" isMarkerVisible="true">
        <dc:Bounds x="906" y="292" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="904" y="268" width="54" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase45_Process_di" bpmnElement="Task_Phase45_Process">
        <dc:Bounds x="1016" y="277" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase6_Notify_di" bpmnElement="Task_Phase6_Notify">
        <dc:Bounds x="1236" y="277" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_Payment_di" bpmnElement="Gateway_Payment" isMarkerVisible="true">
        <dc:Bounds x="1456" y="292" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1457" y="351.5" width="47" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_Chain_di" bpmnElement="Gateway_Chain" isMarkerVisible="true">
        <dc:Bounds x="1606" y="292" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1590" y="351.5" width="82" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_ArchivesDMN_di" bpmnElement="Task_ArchivesDMN">
        <dc:Bounds x="1716" y="277" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_ArchiveRecord_di" bpmnElement="Task_ArchiveRecord">
        <dc:Bounds x="1936" y="277" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_AWB_di" bpmnElement="EndEvent_AWB">
        <dc:Bounds x="2138" y="299" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2120" y="342" width="73" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase8_Forward_di" bpmnElement="Task_Phase8_Forward">
        <dc:Bounds x="1716" y="520" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Phase7_Payment_di" bpmnElement="Task_Phase7_Payment">
        <dc:Bounds x="1401" y="80" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_RequestMissingInfo_di" bpmnElement="Task_RequestMissingInfo">
        <dc:Bounds x="856" y="440" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_StillIncomplete_di" bpmnElement="Gateway_StillIncomplete" isMarkerVisible="true">
        <dc:Bounds x="919" y="595" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="915" y="652" width="59" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_RefuseToProcess_di" bpmnElement="Task_RefuseToProcess">
        <dc:Bounds x="1236" y="580" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_Start_Phase1_di" bpmnElement="Flow_Start_Phase1">
        <di:waypoint x="196" y="317" />
        <di:waypoint x="246" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Phase1_Phase2_di" bpmnElement="Flow_Phase1_Phase2">
        <di:waypoint x="406" y="317" />
        <di:waypoint x="466" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Phase2_Phase3_di" bpmnElement="Flow_Phase2_Phase3">
        <di:waypoint x="626" y="317" />
        <di:waypoint x="686" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Phase3_Gateway_di" bpmnElement="Flow_Phase3_Gateway">
        <di:waypoint x="846" y="317" />
        <di:waypoint x="906" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Complete_Yes_di" bpmnElement="Flow_Complete_Yes">
        <di:waypoint x="956" y="317" />
        <di:waypoint x="1016" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Complete_No_di" bpmnElement="Flow_Complete_No">
        <di:waypoint x="931" y="342" />
        <di:waypoint x="931" y="440" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_MissingInfo_Recheck_di" bpmnElement="Flow_MissingInfo_Recheck">
        <di:waypoint x="941" y="520" />
        <di:waypoint x="941" y="598" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Recheck_Process_di" bpmnElement="Flow_Recheck_Process">
        <di:waypoint x="969" y="620" />
        <di:waypoint x="1096" y="620" />
        <di:waypoint x="1096" y="357" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Recheck_Refuse_di" bpmnElement="Flow_Recheck_Refuse">
        <di:waypoint x="969" y="620" />
        <di:waypoint x="1236" y="620" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Refuse_Notify_di" bpmnElement="Flow_Refuse_Notify">
        <di:waypoint x="1316" y="580" />
        <di:waypoint x="1316" y="357" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Phase45_Phase6_di" bpmnElement="Flow_Phase45_Phase6">
        <di:waypoint x="1176" y="317" />
        <di:waypoint x="1236" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Phase6_PaymentGateway_di" bpmnElement="Flow_Phase6_PaymentGateway">
        <di:waypoint x="1396" y="317" />
        <di:waypoint x="1456" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Payment_Yes_di" bpmnElement="Flow_Payment_Yes">
        <di:waypoint x="1481" y="292" />
        <di:waypoint x="1481" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Payment_No_di" bpmnElement="Flow_Payment_No">
        <di:waypoint x="1506" y="317" />
        <di:waypoint x="1606" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_PaymentTask_Chain_di" bpmnElement="Flow_PaymentTask_Chain">
        <di:waypoint x="1561" y="120" />
        <di:waypoint x="1631" y="120" />
        <di:waypoint x="1631" y="292" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Chain_Yes_di" bpmnElement="Flow_Chain_Yes">
        <di:waypoint x="1631" y="342" />
        <di:waypoint x="1631" y="560" />
        <di:waypoint x="1716" y="560" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Chain_No_di" bpmnElement="Flow_Chain_No">
        <di:waypoint x="1656" y="317" />
        <di:waypoint x="1716" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_ChainTask_Archives_di" bpmnElement="Flow_ChainTask_Archives">
        <di:waypoint x="1796" y="520" />
        <di:waypoint x="1796" y="357" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_ArchivesDMN_Record_di" bpmnElement="Flow_ArchivesDMN_Record">
        <di:waypoint x="1876" y="317" />
        <di:waypoint x="1936" y="317" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Archive_End_di" bpmnElement="Flow_Archive_End">
        <di:waypoint x="2076" y="317" />
        <di:waypoint x="2138" y="317" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * Tree Felling Permit Example Process
 * Demonstrates BPMN process with DMN decision tasks and embedded forms
 * Source: examples/Flevoland/tree-felling-permit.bpmn
 * Tested in Operaton Cockpit - Working
 */
export const TREE_FELLING_EXAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_TreeFellingSubProcess"
  targetNamespace="http://example.com/tree-permit"
  exporter="Camunda Modeler"
  exporterVersion="5.36.0">

  <bpmn:process id="TreeFellingPermitSubProcess" name="Tree Felling Permit - Processing and Decision" isExecutable="true" camunda:historyTimeToLive="180">

    <!-- No form on StartEvent - variables come from AWB parent Call Activity -->
    <bpmn:startEvent id="SubStart" name="Start processing">
      <bpmn:outgoing>Flow_Sub_Start_Assess</bpmn:outgoing>
    </bpmn:startEvent>

    <bpmn:businessRuleTask id="Sub_AssessPermit" name="Assess tree felling permit (APV)" camunda:resultVariable="permitDecision" camunda:decisionRef="TreeFellingDecision" camunda:mapDecisionResult="singleEntry">
      <bpmn:incoming>Flow_Sub_Start_Assess</bpmn:incoming>
      <bpmn:outgoing>Flow_Sub_Assess_Gateway</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <bpmn:exclusiveGateway id="Sub_Gateway_Permit" name="Permit granted?">
      <bpmn:incoming>Flow_Sub_Assess_Gateway</bpmn:incoming>
      <bpmn:outgoing>Flow_Sub_Permit_Yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_Sub_Permit_No</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:businessRuleTask id="Sub_AssessReplacement" name="Assess replacement tree requirement" camunda:resultVariable="replacementDecision" camunda:decisionRef="ReplacementTreeDecision" camunda:mapDecisionResult="singleEntry">
      <bpmn:incoming>Flow_Sub_Permit_Yes</bpmn:incoming>
      <bpmn:outgoing>Flow_Sub_Replacement_Granted</bpmn:outgoing>
    </bpmn:businessRuleTask>

    <bpmn:scriptTask id="Sub_SetGranted" name="Set decision variables: Granted" scriptFormat="javascript">
      <bpmn:incoming>Flow_Sub_Replacement_Granted</bpmn:incoming>
      <bpmn:outgoing>Flow_Sub_Granted_End</bpmn:outgoing>
      <bpmn:script><![CDATA[
        execution.setVariable("status", "Approved");
        execution.setVariable("decisionType", "Granted");
        execution.setVariable("finalMessage", "Your tree felling permit has been GRANTED.");
        execution.setVariable("paymentRequired", false);
        execution.setVariable("chainProcessRequired", false);

        var replacement = execution.getVariable("replacementDecision");
        var replacementText;
        if (replacement === true || replacement === "true") {
          replacementText = "Replacement tree REQUIRED - you are obligated to plant a replacement tree.";
        } else {
          replacementText = "No replacement tree required.";
        }
        execution.setVariable("replacementInfo", replacementText);
      ]]></bpmn:script>
    </bpmn:scriptTask>

    <bpmn:scriptTask id="Sub_SetRejected" name="Set decision variables: Rejected" scriptFormat="javascript">
      <bpmn:incoming>Flow_Sub_Permit_No</bpmn:incoming>
      <bpmn:outgoing>Flow_Sub_Rejected_End</bpmn:outgoing>
      <bpmn:script><![CDATA[
        execution.setVariable("status", "Rejected");
        execution.setVariable("decisionType", "Rejected");
        execution.setVariable("finalMessage", "Your tree felling permit has been REJECTED. You may appeal within 6 weeks (Awb 6:7).");
        execution.setVariable("replacementInfo", "N/A - permit was rejected.");
        execution.setVariable("paymentRequired", false);
        execution.setVariable("chainProcessRequired", false);
      ]]></bpmn:script>
    </bpmn:scriptTask>

    <bpmn:endEvent id="SubEnd" name="Decision ready">
      <bpmn:incoming>Flow_Sub_Granted_End</bpmn:incoming>
      <bpmn:incoming>Flow_Sub_Rejected_End</bpmn:incoming>
    </bpmn:endEvent>

    <bpmn:sequenceFlow id="Flow_Sub_Start_Assess"        sourceRef="SubStart"               targetRef="Sub_AssessPermit" />
    <bpmn:sequenceFlow id="Flow_Sub_Assess_Gateway"      sourceRef="Sub_AssessPermit"        targetRef="Sub_Gateway_Permit" />
    <bpmn:sequenceFlow id="Flow_Sub_Permit_Yes" sourceRef="Sub_Gateway_Permit" targetRef="Sub_AssessReplacement">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${permitDecision == "Permit"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Sub_Permit_No" sourceRef="Sub_Gateway_Permit" targetRef="Sub_SetRejected">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${permitDecision == "Reject"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Sub_Replacement_Granted" sourceRef="Sub_AssessReplacement"   targetRef="Sub_SetGranted" />
    <bpmn:sequenceFlow id="Flow_Sub_Granted_End"         sourceRef="Sub_SetGranted"           targetRef="SubEnd" />
    <bpmn:sequenceFlow id="Flow_Sub_Rejected_End"        sourceRef="Sub_SetRejected"          targetRef="SubEnd" />

  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub" bpmnElement="TreeFellingPermitSubProcess">
      <bpmndi:BPMNShape id="SubStart_di" bpmnElement="SubStart">
        <dc:Bounds x="152" y="116" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="130" y="159" width="80" height="27" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_AssessPermit_di" bpmnElement="Sub_AssessPermit">
        <dc:Bounds x="248" y="94" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_Gateway_Permit_di" bpmnElement="Sub_Gateway_Permit" isMarkerVisible="true">
        <dc:Bounds x="468" y="109" width="50" height="50" />
        <bpmndi:BPMNLabel><dc:Bounds x="460" y="85" width="66" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_AssessReplacement_di" bpmnElement="Sub_AssessReplacement">
        <dc:Bounds x="578" y="94" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_SetGranted_di" bpmnElement="Sub_SetGranted">
        <dc:Bounds x="798" y="94" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_SetRejected_di" bpmnElement="Sub_SetRejected">
        <dc:Bounds x="578" y="250" width="160" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubEnd_di" bpmnElement="SubEnd">
        <dc:Bounds x="1020" y="116" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="996" y="159" width="84" height="27" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_Sub_Start_Assess_di"       bpmnElement="Flow_Sub_Start_Assess">       <di:waypoint x="188" y="134" /><di:waypoint x="248" y="134" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Sub_Assess_Gateway_di"     bpmnElement="Flow_Sub_Assess_Gateway">     <di:waypoint x="408" y="134" /><di:waypoint x="468" y="134" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Sub_Permit_Yes_di"         bpmnElement="Flow_Sub_Permit_Yes">         <di:waypoint x="518" y="134" /><di:waypoint x="578" y="134" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Sub_Permit_No_di"          bpmnElement="Flow_Sub_Permit_No">          <di:waypoint x="493" y="159" /><di:waypoint x="493" y="290" /><di:waypoint x="578" y="290" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Sub_Replacement_Granted_di" bpmnElement="Flow_Sub_Replacement_Granted"><di:waypoint x="738" y="134" /><di:waypoint x="798" y="134" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Sub_Granted_End_di"        bpmnElement="Flow_Sub_Granted_End">        <di:waypoint x="958" y="134" /><di:waypoint x="1020" y="134" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Sub_Rejected_End_di"       bpmnElement="Flow_Sub_Rejected_End">       <di:waypoint x="738" y="290" /><di:waypoint x="1038" y="290" /><di:waypoint x="1038" y="152" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>

</bpmn:definitions>`;

/**
 * Migration and Asylum Procedure Example
 * Demonstrates complex government process with multiple branches and forms
 * Source: examples/ind/Asiel_en_Migratie_procedure_001.bpmn
 */
export const ASYLUM_MIGRATION_EXAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_046sene" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="5.43.1" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.24.0">
  <bpmn:process id="Process_Migratie_en_Asiel" name="Migratie en Asiel Procedure 007" isExecutable="true" camunda:historyTimeToLive="1">
    <bpmn:startEvent id="StartEvent_Migratie_Procedure" name="Start procedure">
      <bpmn:outgoing>Flow_08g52cy</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_08g52cy" sourceRef="StartEvent_Migratie_Procedure" targetRef="Activity_1obwf16" />
    <bpmn:userTask id="Activity_1obwf16" name="Initiele registratie dossier" camunda:formRef="InitieleRegistratie" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_08g52cy</bpmn:incoming>
      <bpmn:outgoing>Flow_03dawv7</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_0hq87yk" name="Verzoek" sourceRef="Gateway_1ifoytx" targetRef="Activity_0m6bfjf" />
    <bpmn:userTask id="Activity_0m6bfjf" name="Verzoek Mvv aanvraag + verblijfs vergunning" camunda:formRef="VerzoekRegulier" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0hq87yk</bpmn:incoming>
      <bpmn:outgoing>Flow_1twcf3p</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:exclusiveGateway id="Gateway_1ifoytx" default="Flow_0hq87yk">
      <bpmn:incoming>Flow_0nf4vfv</bpmn:incoming>
      <bpmn:outgoing>Flow_0hq87yk</bpmn:outgoing>
      <bpmn:outgoing>Flow_0r7435z</bpmn:outgoing>
      <bpmn:outgoing>Flow_1gzeepv</bpmn:outgoing>
      <bpmn:outgoing>Flow_1fe7w66</bpmn:outgoing>
      <bpmn:outgoing>Flow_0myspx5</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:endEvent id="Event_0tyobpl" name="Onherroepelijk">
      <bpmn:incoming>Flow_1iotsyh</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:exclusiveGateway id="Gateway_0by5it5">
      <bpmn:incoming>Flow_1lzwlkf</bpmn:incoming>
      <bpmn:incoming>Flow_0capg8d</bpmn:incoming>
      <bpmn:incoming>Flow_0kbk64r</bpmn:incoming>
      <bpmn:outgoing>Flow_1h3chzl</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:exclusiveGateway id="Gateway_15n1suh">
      <bpmn:incoming>Flow_1twcf3p</bpmn:incoming>
      <bpmn:incoming>Flow_0f41u3t</bpmn:incoming>
      <bpmn:incoming>Flow_1h3chzl</bpmn:incoming>
      <bpmn:outgoing>Flow_085cxg4</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_1twcf3p" sourceRef="Activity_0m6bfjf" targetRef="Gateway_15n1suh" />
    <bpmn:exclusiveGateway id="Gateway_0zz5a58">
      <bpmn:incoming>Flow_0gxpeae</bpmn:incoming>
      <bpmn:incoming>Flow_1jue3vu</bpmn:incoming>
      <bpmn:incoming>Flow_1wmkcba</bpmn:incoming>
      <bpmn:outgoing>Flow_0kbk64r</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_0gxpeae" sourceRef="Activity_1pov44k" targetRef="Gateway_0zz5a58" />
    <bpmn:exclusiveGateway id="Gateway_1opcnlv">
      <bpmn:incoming>Flow_107objo</bpmn:incoming>
      <bpmn:incoming>Flow_14trbud</bpmn:incoming>
      <bpmn:incoming>Flow_1xshwha</bpmn:incoming>
      <bpmn:outgoing>Flow_1wmkcba</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_107objo" sourceRef="Activity_0tvsug0" targetRef="Gateway_1opcnlv" />
    <bpmn:exclusiveGateway id="Gateway_1lixh3n">
      <bpmn:incoming>Flow_1kexgkg</bpmn:incoming>
      <bpmn:incoming>Flow_089jb48</bpmn:incoming>
      <bpmn:outgoing>Flow_1xshwha</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_1kexgkg" sourceRef="Activity_1hh5s55" targetRef="Gateway_1lixh3n" />
    <bpmn:userTask id="Activity_1ahxqsl" name="Behandeling Mvv + verblijfs vergunning" camunda:formRef="BehandelingRegulier" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0r7435z</bpmn:incoming>
      <bpmn:outgoing>Flow_0ta8l0r</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_1pov44k" name="Bezwaar" camunda:formRef="BezwaarRegulier" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_1gzeepv</bpmn:incoming>
      <bpmn:outgoing>Flow_0gxpeae</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_0tvsug0" name="Beroep" camunda:formRef="Beroep" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_1fe7w66</bpmn:incoming>
      <bpmn:outgoing>Flow_107objo</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_1hh5s55" name="Hoger beroep" camunda:formRef="HogerBeroep" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0myspx5</bpmn:incoming>
      <bpmn:outgoing>Flow_1kexgkg</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_0f41u3t" sourceRef="Event_19mbee6" targetRef="Gateway_15n1suh" />
    <bpmn:boundaryEvent id="Event_19mbee6" name="Nieuwe feiten (listen)" attachedToRef="Activity_0m6bfjf">
      <bpmn:outgoing>Flow_0f41u3t</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_07n85it" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="Flow_1lzwlkf" sourceRef="Event_17pitff" targetRef="Gateway_0by5it5" />
    <bpmn:sequenceFlow id="Flow_1jue3vu" sourceRef="Event_0h87wpe" targetRef="Gateway_0zz5a58" />
    <bpmn:sequenceFlow id="Flow_14trbud" sourceRef="Event_0oyghjo" targetRef="Gateway_1opcnlv" />
    <bpmn:sequenceFlow id="Flow_089jb48" sourceRef="Event_18er9uk" targetRef="Gateway_1lixh3n" />
    <bpmn:boundaryEvent id="Event_18er9uk" name="Nieuwe feiten (listen)" attachedToRef="Activity_1hh5s55">
      <bpmn:outgoing>Flow_089jb48</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_0p668yg" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_17pitff" name="Nieuwe feiten (listen)" attachedToRef="Activity_1ahxqsl">
      <bpmn:outgoing>Flow_1lzwlkf</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_0x7r6q3" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_0h87wpe" name="Nieuwe feiten (listen)" attachedToRef="Activity_1pov44k">
      <bpmn:outgoing>Flow_1jue3vu</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_05x9ocl" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_0oyghjo" name="Nieuwe feiten (listen)" attachedToRef="Activity_0tvsug0">
      <bpmn:outgoing>Flow_14trbud</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_09l0abt" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:exclusiveGateway id="Gateway_0qr43ko" default="Flow_0qpcwio">
      <bpmn:incoming>Flow_05g3f3n</bpmn:incoming>
      <bpmn:outgoing>Flow_0nf4vfv</bpmn:outgoing>
      <bpmn:outgoing>Flow_0ai5yn9</bpmn:outgoing>
      <bpmn:outgoing>Flow_0qpcwio</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_0nf4vfv" name="Regulier/Migratie" sourceRef="Gateway_0qr43ko" targetRef="Gateway_1ifoytx">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${AsielOfRegulier == "Regulier"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_0r7435z" name="Behandeling" sourceRef="Gateway_1ifoytx" targetRef="Activity_1ahxqsl">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Behandeling"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_1gzeepv" name="Bezwaar" sourceRef="Gateway_1ifoytx" targetRef="Activity_1pov44k">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Bezwaar"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_1fe7w66" name="Beroep" sourceRef="Gateway_1ifoytx" targetRef="Activity_0tvsug0">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Beroep"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_0myspx5" name="Hoger beroep" sourceRef="Gateway_1ifoytx" targetRef="Activity_1hh5s55">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "HogerBeroep"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:exclusiveGateway id="Gateway_1k6otmx" default="Flow_0capg8d">
      <bpmn:incoming>Flow_0ta8l0r</bpmn:incoming>
      <bpmn:outgoing>Flow_1iotsyh</bpmn:outgoing>
      <bpmn:outgoing>Flow_0capg8d</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_0ta8l0r" sourceRef="Activity_1ahxqsl" targetRef="Gateway_1k6otmx" />
    <bpmn:sequenceFlow id="Flow_1iotsyh" sourceRef="Gateway_1k6otmx" targetRef="Event_0tyobpl">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${OnherroepelijkRegulier == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_0capg8d" sourceRef="Gateway_1k6otmx" targetRef="Gateway_0by5it5" />
    <bpmn:sequenceFlow id="Flow_1xshwha" sourceRef="Gateway_1lixh3n" targetRef="Gateway_1opcnlv" />
    <bpmn:sequenceFlow id="Flow_1wmkcba" sourceRef="Gateway_1opcnlv" targetRef="Gateway_0zz5a58" />
    <bpmn:sequenceFlow id="Flow_0kbk64r" sourceRef="Gateway_0zz5a58" targetRef="Gateway_0by5it5" />
    <bpmn:sequenceFlow id="Flow_1h3chzl" sourceRef="Gateway_0by5it5" targetRef="Gateway_15n1suh" />
    <bpmn:exclusiveGateway id="Gateway_0dtngtd">
      <bpmn:incoming>Flow_03dawv7</bpmn:incoming>
      <bpmn:incoming>Flow_085cxg4</bpmn:incoming>
      <bpmn:incoming>Flow_0lddqgd</bpmn:incoming>
      <bpmn:outgoing>Flow_0rv0yhc</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_03dawv7" sourceRef="Activity_1obwf16" targetRef="Gateway_0dtngtd" />
    <bpmn:sequenceFlow id="Flow_085cxg4" sourceRef="Gateway_15n1suh" targetRef="Gateway_0dtngtd" />
    <bpmn:sequenceFlow id="Flow_0rv0yhc" sourceRef="Gateway_0dtngtd" targetRef="Activity_0cxwftw" />
    <bpmn:exclusiveGateway id="Gateway_04fuup8" default="Flow_07cvw4b">
      <bpmn:incoming>Flow_0ai5yn9</bpmn:incoming>
      <bpmn:outgoing>Flow_07cvw4b</bpmn:outgoing>
      <bpmn:outgoing>Flow_0uqymo8</bpmn:outgoing>
      <bpmn:outgoing>Flow_1b87i2y</bpmn:outgoing>
      <bpmn:outgoing>Flow_0npimy6</bpmn:outgoing>
      <bpmn:outgoing>Flow_1isupnd</bpmn:outgoing>
      <bpmn:outgoing>Flow_0jcxpey</bpmn:outgoing>
      <bpmn:outgoing>Flow_0x0ljru</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:boundaryEvent id="Event_0wnyba3" name="Nieuwe feiten (listen)" attachedToRef="Activity_0a4pfvp">
      <bpmn:outgoing>Flow_1uaelp8</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_1n8g7in" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_1hea6xy" name="Nieuwe feiten (listen)" attachedToRef="Activity_1qio9ph">
      <bpmn:outgoing>Flow_029xa2q</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_0gcni27" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_03hbfqb" name="Nieuwe feiten (listen)" attachedToRef="Activity_1wy75jv">
      <bpmn:outgoing>Flow_16h1gqd</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_15lhsdo" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_0y34ets" name="Nieuwe feiten (listen)" attachedToRef="Activity_0b0g01u">
      <bpmn:outgoing>Flow_1wfynvr</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_07rx81d" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_1fxqram" name="Nieuwe feiten (listen)" attachedToRef="Activity_113md2y">
      <bpmn:outgoing>Flow_0d99fvj</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_0c43f5r" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="Event_1jjke58" name="Nieuwe feiten (listen)" attachedToRef="Activity_0w8t0s3">
      <bpmn:outgoing>Flow_0q7sxmn</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_02xjth6" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="Flow_07cvw4b" name="Verzoek" sourceRef="Gateway_04fuup8" targetRef="Activity_0w8t0s3" />
    <bpmn:sequenceFlow id="Flow_0uqymo8" name="Registratie" sourceRef="Gateway_04fuup8" targetRef="Activity_113md2y">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Registratie"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_1b87i2y" name="Indiening" sourceRef="Gateway_04fuup8" targetRef="Activity_0b0g01u">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Indiening"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_0npimy6" name="Behandeling" sourceRef="Gateway_04fuup8" targetRef="Activity_1wy75jv">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Behandeling"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_1isupnd" name="Beroep" sourceRef="Gateway_04fuup8" targetRef="Activity_1qio9ph">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Beroep"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_0jcxpey" name="Hoger beroep" sourceRef="Gateway_04fuup8" targetRef="Activity_0a4pfvp">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "HogerBeroep"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_0ai5yn9" name="Asiel" sourceRef="Gateway_0qr43ko" targetRef="Gateway_04fuup8">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${AsielOfRegulier == "Asiel"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:exclusiveGateway id="Gateway_1ngmyot" default="Flow_10c18rc">
      <bpmn:incoming>Flow_0cp4o1w</bpmn:incoming>
      <bpmn:outgoing>Flow_05a32eg</bpmn:outgoing>
      <bpmn:outgoing>Flow_10c18rc</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_0cp4o1w" sourceRef="Activity_1wy75jv" targetRef="Gateway_1ngmyot" />
    <bpmn:endEvent id="Event_1b6tq17" name="Onherroepelijk">
      <bpmn:incoming>Flow_05a32eg</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_05a32eg" sourceRef="Gateway_1ngmyot" targetRef="Event_1b6tq17">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${OnherroepelijkAsiel == true}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:exclusiveGateway id="Gateway_1c8fzlx">
      <bpmn:incoming>Flow_16h1gqd</bpmn:incoming>
      <bpmn:incoming>Flow_10c18rc</bpmn:incoming>
      <bpmn:incoming>Flow_1uutgxx</bpmn:incoming>
      <bpmn:outgoing>Flow_09mpkpd</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_16h1gqd" sourceRef="Event_03hbfqb" targetRef="Gateway_1c8fzlx" />
    <bpmn:exclusiveGateway id="Gateway_08a9t9e">
      <bpmn:incoming>Flow_029xa2q</bpmn:incoming>
      <bpmn:incoming>Flow_1uj1qvs</bpmn:incoming>
      <bpmn:incoming>Flow_1hd832p</bpmn:incoming>
      <bpmn:outgoing>Flow_1uutgxx</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:exclusiveGateway id="Gateway_1i12qf4">
      <bpmn:incoming>Flow_1uaelp8</bpmn:incoming>
      <bpmn:incoming>Flow_1bbt60a</bpmn:incoming>
      <bpmn:outgoing>Flow_1hd832p</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:exclusiveGateway id="Gateway_12mnflc">
      <bpmn:incoming>Flow_1wfynvr</bpmn:incoming>
      <bpmn:incoming>Flow_0ibwf41</bpmn:incoming>
      <bpmn:incoming>Flow_1eimuq7</bpmn:incoming>
      <bpmn:outgoing>Flow_1a21lky</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:exclusiveGateway id="Gateway_0s606fx">
      <bpmn:incoming>Flow_0d99fvj</bpmn:incoming>
      <bpmn:incoming>Flow_1o9vtv2</bpmn:incoming>
      <bpmn:incoming>Flow_1a21lky</bpmn:incoming>
      <bpmn:outgoing>Flow_1cgosxg</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:exclusiveGateway id="Gateway_1wncxgz">
      <bpmn:incoming>Flow_0q7sxmn</bpmn:incoming>
      <bpmn:incoming>Flow_13kw7ms</bpmn:incoming>
      <bpmn:incoming>Flow_1cgosxg</bpmn:incoming>
      <bpmn:outgoing>Flow_0lddqgd</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_1uaelp8" sourceRef="Event_0wnyba3" targetRef="Gateway_1i12qf4" />
    <bpmn:sequenceFlow id="Flow_029xa2q" sourceRef="Event_1hea6xy" targetRef="Gateway_08a9t9e" />
    <bpmn:sequenceFlow id="Flow_1wfynvr" sourceRef="Event_0y34ets" targetRef="Gateway_12mnflc" />
    <bpmn:sequenceFlow id="Flow_0d99fvj" sourceRef="Event_1fxqram" targetRef="Gateway_0s606fx" />
    <bpmn:sequenceFlow id="Flow_0q7sxmn" sourceRef="Event_1jjke58" targetRef="Gateway_1wncxgz" />
    <bpmn:sequenceFlow id="Flow_1bbt60a" sourceRef="Activity_0a4pfvp" targetRef="Gateway_1i12qf4" />
    <bpmn:sequenceFlow id="Flow_1uj1qvs" sourceRef="Activity_1qio9ph" targetRef="Gateway_08a9t9e" />
    <bpmn:sequenceFlow id="Flow_10c18rc" sourceRef="Gateway_1ngmyot" targetRef="Gateway_1c8fzlx" />
    <bpmn:sequenceFlow id="Flow_0ibwf41" sourceRef="Activity_0b0g01u" targetRef="Gateway_12mnflc" />
    <bpmn:sequenceFlow id="Flow_1o9vtv2" sourceRef="Activity_113md2y" targetRef="Gateway_0s606fx" />
    <bpmn:sequenceFlow id="Flow_13kw7ms" sourceRef="Activity_0w8t0s3" targetRef="Gateway_1wncxgz" />
    <bpmn:sequenceFlow id="Flow_1hd832p" sourceRef="Gateway_1i12qf4" targetRef="Gateway_08a9t9e" />
    <bpmn:sequenceFlow id="Flow_1uutgxx" sourceRef="Gateway_08a9t9e" targetRef="Gateway_1c8fzlx" />
    <bpmn:sequenceFlow id="Flow_09mpkpd" sourceRef="Gateway_1c8fzlx" targetRef="Gateway_0u9zyqn" />
    <bpmn:sequenceFlow id="Flow_1a21lky" sourceRef="Gateway_12mnflc" targetRef="Gateway_0s606fx" />
    <bpmn:sequenceFlow id="Flow_1cgosxg" sourceRef="Gateway_0s606fx" targetRef="Gateway_1wncxgz" />
    <bpmn:sequenceFlow id="Flow_0lddqgd" sourceRef="Gateway_1wncxgz" targetRef="Gateway_0dtngtd" />
    <bpmn:endEvent id="Event_1guseex" name="Procedure gestopt">
      <bpmn:incoming>Flow_0qpcwio</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_0qpcwio" name="Stop" sourceRef="Gateway_0qr43ko" targetRef="Event_1guseex" />
    <bpmn:userTask id="Activity_0w8t0s3" name="Verzoek tot asiel" camunda:formRef="VerzoekAsiel" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_07cvw4b</bpmn:incoming>
      <bpmn:outgoing>Flow_13kw7ms</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_113md2y" name="Registratie verzoek tot asiel" camunda:formRef="RegistratieAsiel" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0uqymo8</bpmn:incoming>
      <bpmn:outgoing>Flow_1o9vtv2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_0b0g01u" name="Indiening verzoek tot asiel" camunda:formRef="IndieningAsiel" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_1b87i2y</bpmn:incoming>
      <bpmn:outgoing>Flow_0ibwf41</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_1wy75jv" name="Behandeling inhoudelijk" camunda:formRef="BehandelingAsiel" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0npimy6</bpmn:incoming>
      <bpmn:outgoing>Flow_0cp4o1w</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_1qio9ph" name="Beroep" camunda:formRef="Beroep" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_1isupnd</bpmn:incoming>
      <bpmn:outgoing>Flow_1uj1qvs</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:userTask id="Activity_0a4pfvp" name="Hoger beroep" camunda:formRef="HogerBeroep" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0jcxpey</bpmn:incoming>
      <bpmn:outgoing>Flow_1bbt60a</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_0pz6emc" sourceRef="Event_0ew1msn" targetRef="Activity_01glmwz" />
    <bpmn:sequenceFlow id="Flow_0s7y4qh" sourceRef="Activity_01glmwz" targetRef="Event_NieuweFeiten" />
    <bpmn:endEvent id="Event_NieuweFeiten" name="Nieuwe feiten (publish)">
      <bpmn:incoming>Flow_0s7y4qh</bpmn:incoming>
      <bpmn:signalEventDefinition id="SignalEventDefinition_1akjoj1" signalRef="Signal_13blrff" />
    </bpmn:endEvent>
    <bpmn:userTask id="Activity_0cxwftw" name="Inzage dossier" camunda:formRef="InzageDossier" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0rv0yhc</bpmn:incoming>
      <bpmn:outgoing>Flow_0hs17xb</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:manualTask id="Activity_01glmwz" name="Toevoegen nieuwe feiten aan dossier">
      <bpmn:incoming>Flow_0pz6emc</bpmn:incoming>
      <bpmn:outgoing>Flow_0s7y4qh</bpmn:outgoing>
    </bpmn:manualTask>
    <bpmn:startEvent id="Event_0ew1msn" name="Nieuwe feiten of omstandigheden">
      <bpmn:outgoing>Flow_0pz6emc</bpmn:outgoing>
      <bpmn:conditionalEventDefinition id="ConditionalEventDefinition_0x5otf8">
        <bpmn:condition xsi:type="bpmn:tFormalExpression" />
      </bpmn:conditionalEventDefinition>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_0hs17xb" sourceRef="Activity_0cxwftw" targetRef="Activity_05lhdhf" />
    <bpmn:exclusiveGateway id="Gateway_0u9zyqn">
      <bpmn:incoming>Flow_09mpkpd</bpmn:incoming>
      <bpmn:incoming>Flow_1j86ng8</bpmn:incoming>
      <bpmn:incoming>Flow_0ggrago</bpmn:incoming>
      <bpmn:outgoing>Flow_1eimuq7</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_1eimuq7" sourceRef="Gateway_0u9zyqn" targetRef="Gateway_12mnflc" />
    <bpmn:sequenceFlow id="Flow_0x0ljru" name="Bijzonderheden" sourceRef="Gateway_04fuup8" targetRef="Activity_1bqu3km">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${ProcedureFase == "Bijzonderheden"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:userTask id="Activity_1bqu3km" name="Procedurele bijzonderheden" camunda:formRef="BijzonderhedenAsiel" camunda:formRefBinding="latest">
      <bpmn:extensionElements />
      <bpmn:incoming>Flow_0x0ljru</bpmn:incoming>
      <bpmn:outgoing>Flow_1j86ng8</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_1j86ng8" sourceRef="Activity_1bqu3km" targetRef="Gateway_0u9zyqn" />
    <bpmn:boundaryEvent id="Event_02wwwco" name="Nieuwe feiten (listen)" attachedToRef="Activity_1bqu3km">
      <bpmn:outgoing>Flow_0ggrago</bpmn:outgoing>
      <bpmn:signalEventDefinition id="SignalEventDefinition_026t6d2" signalRef="Signal_13blrff" />
    </bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="Flow_0ggrago" sourceRef="Event_02wwwco" targetRef="Gateway_0u9zyqn" />
    <bpmn:sequenceFlow id="Flow_05g3f3n" sourceRef="Activity_05lhdhf" targetRef="Gateway_0qr43ko" />
    <bpmn:userTask id="Activity_05lhdhf" name="Dossier flow Manipulator" camunda:formRef="DossierManipulator" camunda:formRefBinding="latest">
      <bpmn:incoming>Flow_0hs17xb</bpmn:incoming>
      <bpmn:outgoing>Flow_05g3f3n</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:group id="Group_0ccj31g" categoryValueRef="CategoryValue_074a0zn" />
    <bpmn:group id="Group_05pjf4m" categoryValueRef="CategoryValue_1bqxvw6" />
  </bpmn:process>
  <bpmn:signal id="Signal_2o6hbtg" name="Signal_2o6hbtg" />
  <bpmn:signal id="Signal_22u8p92" name="Signal_22u8p92" />
  <bpmn:signal id="Signal_0fmbeqa" name="Signal_0fmbeqa" />
  <bpmn:signal id="Signal_2kehhbd" name="Signal_2kehhbd" />
  <bpmn:signal id="Signal_3id7lrd" name="Signal_3id7lrd" />
  <bpmn:signal id="Signal_2njubvp" name="Signal_2njubvp" />
  <bpmn:category id="Category_1hmuplg">
    <bpmn:categoryValue id="CategoryValue_074a0zn" value="Asiel" />
  </bpmn:category>
  <bpmn:category id="Category_1gsyli5">
    <bpmn:categoryValue id="CategoryValue_1bqxvw6" value="Regulier/Migratie" />
  </bpmn:category>
  <bpmn:signal id="Signal_13blrff" name="Signal_NieuweFeiten" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_Migratie_en_Asiel">
      <bpmndi:BPMNShape id="Activity_1rz4eex_di" bpmnElement="Activity_0m6bfjf">
        <dc:Bounds x="967" y="680" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1ifoytx_di" bpmnElement="Gateway_1ifoytx" isMarkerVisible="true">
        <dc:Bounds x="915" y="595" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0tyobpl_di" bpmnElement="Event_0tyobpl" bioc:stroke="#831311" bioc:fill="#ffcdd2" color:background-color="#ffcdd2" color:border-color="#831311">
        <dc:Bounds x="1712" y="822" width="36" height="36" />
        <bpmndi:BPMNLabel color:color="#831311">
          <dc:Bounds x="1693" y="868" width="73" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1ovz3ng_di" bpmnElement="Gateway_0by5it5" isMarkerVisible="true">
        <dc:Bounds x="1775" y="910" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_15n1suh_di" bpmnElement="Gateway_15n1suh" isMarkerVisible="true">
        <dc:Bounds x="992" y="910" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_0zz5a58_di" bpmnElement="Gateway_0zz5a58" isMarkerVisible="true">
        <dc:Bounds x="1965" y="910" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1opcnlv_di" bpmnElement="Gateway_1opcnlv" isMarkerVisible="true">
        <dc:Bounds x="2155" y="910" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1lixh3n_di" bpmnElement="Gateway_1lixh3n" isMarkerVisible="true">
        <dc:Bounds x="2345" y="910" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1o58aij_di" bpmnElement="Activity_1ahxqsl">
        <dc:Bounds x="1750" y="680" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1ewjf1i_di" bpmnElement="Activity_1pov44k">
        <dc:Bounds x="1940" y="680" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0di7nt9_di" bpmnElement="Activity_0tvsug0">
        <dc:Bounds x="2130" y="680" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0nbg1tp_di" bpmnElement="Activity_1hh5s55">
        <dc:Bounds x="2320" y="680" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1k6otmx_di" bpmnElement="Gateway_1k6otmx" isMarkerVisible="true">
        <dc:Bounds x="1775" y="815" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_04fuup8_di" bpmnElement="Gateway_04fuup8" isMarkerVisible="true">
        <dc:Bounds x="915" y="405" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1ngmyot_di" bpmnElement="Gateway_1ngmyot" isMarkerVisible="true">
        <dc:Bounds x="1775" y="185" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1b6tq17_di" bpmnElement="Event_1b6tq17" bioc:stroke="#831311" bioc:fill="#ffcdd2" color:background-color="#ffcdd2" color:border-color="#831311">
        <dc:Bounds x="1702" y="192" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1684" y="235" width="73" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1c8fzlx_di" bpmnElement="Gateway_1c8fzlx" isMarkerVisible="true">
        <dc:Bounds x="1775" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_08a9t9e_di" bpmnElement="Gateway_08a9t9e" isMarkerVisible="true">
        <dc:Bounds x="2155" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1i12qf4_di" bpmnElement="Gateway_1i12qf4" isMarkerVisible="true">
        <dc:Bounds x="2345" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_12mnflc_di" bpmnElement="Gateway_12mnflc" isMarkerVisible="true">
        <dc:Bounds x="1385" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_0s606fx_di" bpmnElement="Gateway_0s606fx" isMarkerVisible="true">
        <dc:Bounds x="1195" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1wncxgz_di" bpmnElement="Gateway_1wncxgz" isMarkerVisible="true">
        <dc:Bounds x="992" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_11auu8f_di" bpmnElement="Activity_0w8t0s3">
        <dc:Bounds x="967" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1c1dkj1_di" bpmnElement="Activity_113md2y">
        <dc:Bounds x="1170" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1yukx6v_di" bpmnElement="Activity_0b0g01u">
        <dc:Bounds x="1360" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1s3ee5h_di" bpmnElement="Activity_1wy75jv">
        <dc:Bounds x="1750" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1lmdzrx_di" bpmnElement="Activity_1qio9ph">
        <dc:Bounds x="2130" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_00n9wmp_di" bpmnElement="Activity_0a4pfvp">
        <dc:Bounds x="2320" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_0u9zyqn_di" bpmnElement="Gateway_0u9zyqn" isMarkerVisible="true">
        <dc:Bounds x="1585" y="85" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0rpkckl_di" bpmnElement="Activity_1bqu3km">
        <dc:Bounds x="1560" y="290" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_Migratie_Procedure" bioc:stroke="#205022" bioc:fill="#c8e6c9" color:background-color="#c8e6c9" color:border-color="#205022">
        <dc:Bounds x="182" y="512" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="164" y="555" width="77" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1t6qa2s_di" bpmnElement="Activity_1obwf16">
        <dc:Bounds x="270" y="490" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_0qr43ko_di" bpmnElement="Gateway_0qr43ko" isMarkerVisible="true" bioc:stroke="#6b3c00" bioc:fill="#ffe0b2" color:background-color="#ffe0b2" color:border-color="#6b3c00">
        <dc:Bounds x="795" y="505" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_0dtngtd_di" bpmnElement="Gateway_0dtngtd" isMarkerVisible="true">
        <dc:Bounds x="425" y="505" width="50" height="50" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1guseex_di" bpmnElement="Event_1guseex" bioc:stroke="#831311" bioc:fill="#ffcdd2" color:background-color="#ffcdd2" color:border-color="#831311">
        <dc:Bounds x="912" y="512" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="964" y="516" width="52" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1v0nt8t_di" bpmnElement="Event_NieuweFeiten">
        <dc:Bounds x="422" y="982" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="407" y="1025" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0xug5yp_di" bpmnElement="Activity_0cxwftw" bioc:stroke="#5b176d" bioc:fill="#e1bee7" color:background-color="#e1bee7" color:border-color="#5b176d">
        <dc:Bounds x="500" y="490" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0tdi794_di" bpmnElement="Activity_01glmwz">
        <dc:Bounds x="270" y="960" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_09bvsyw_di" bpmnElement="Event_0ew1msn" bioc:stroke="#205022" bioc:fill="#c8e6c9" color:background-color="#c8e6c9" color:border-color="#205022">
        <dc:Bounds x="182" y="982" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="160" y="1025" width="82" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0u1ei2t_di" bpmnElement="Activity_05lhdhf" bioc:stroke="#5b176d" bioc:fill="#e1bee7" color:background-color="#e1bee7" color:border-color="#5b176d">
        <dc:Bounds x="660" y="490" width="100" height="80" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_01cjjlp_di" bpmnElement="Event_02wwwco">
        <dc:Bounds x="1642" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1666" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0tmr30v_di" bpmnElement="Event_1jjke58">
        <dc:Bounds x="1049" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1077" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_09jq6ah_di" bpmnElement="Event_1fxqram">
        <dc:Bounds x="1252" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1276" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0o80g2h_di" bpmnElement="Event_0y34ets">
        <dc:Bounds x="1442" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1466" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1s3dc9r_di" bpmnElement="Event_03hbfqb">
        <dc:Bounds x="1832" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1856" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1a06syz_di" bpmnElement="Event_1hea6xy">
        <dc:Bounds x="2212" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2236" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_19v99lg_di" bpmnElement="Event_0wnyba3">
        <dc:Bounds x="2402" y="272" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2426" y="258" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0dskvs5_di" bpmnElement="Event_0oyghjo">
        <dc:Bounds x="2212" y="742" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2236" y="785" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0b6pjnc_di" bpmnElement="Event_0h87wpe">
        <dc:Bounds x="2022" y="742" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2046" y="785" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1rawlgq_di" bpmnElement="Event_17pitff">
        <dc:Bounds x="1832" y="742" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1856" y="785" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_0gwzn5r_di" bpmnElement="Event_18er9uk">
        <dc:Bounds x="2402" y="742" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2426" y="785" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1ede9dr_di" bpmnElement="Event_19mbee6">
        <dc:Bounds x="1049" y="742" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1073" y="783" width="67" height="27" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_0hq87yk_di" bpmnElement="Flow_0hq87yk">
        <di:waypoint x="940" y="645" />
        <di:waypoint x="940" y="720" />
        <di:waypoint x="967" y="720" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="960" y="653" width="40" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1twcf3p_di" bpmnElement="Flow_1twcf3p">
        <di:waypoint x="1017" y="760" />
        <di:waypoint x="1017" y="910" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0nf4vfv_di" bpmnElement="Flow_0nf4vfv">
        <di:waypoint x="820" y="555" />
        <di:waypoint x="820" y="620" />
        <di:waypoint x="915" y="620" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="768" y="643" width="84" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0r7435z_di" bpmnElement="Flow_0r7435z">
        <di:waypoint x="965" y="620" />
        <di:waypoint x="1810" y="620" />
        <di:waypoint x="1810" y="680" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1748" y="643" width="62" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1gzeepv_di" bpmnElement="Flow_1gzeepv">
        <di:waypoint x="965" y="620" />
        <di:waypoint x="1990" y="620" />
        <di:waypoint x="1990" y="680" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1942" y="643" width="44" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1fe7w66_di" bpmnElement="Flow_1fe7w66">
        <di:waypoint x="965" y="620" />
        <di:waypoint x="2180" y="620" />
        <di:waypoint x="2180" y="680" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2136" y="643" width="36" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0myspx5_di" bpmnElement="Flow_0myspx5">
        <di:waypoint x="965" y="620" />
        <di:waypoint x="2370" y="620" />
        <di:waypoint x="2370" y="680" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2301" y="643" width="68" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1iotsyh_di" bpmnElement="Flow_1iotsyh">
        <di:waypoint x="1775" y="840" />
        <di:waypoint x="1748" y="840" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2173" y="803" width="73" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1lzwlkf_di" bpmnElement="Flow_1lzwlkf">
        <di:waypoint x="1850" y="778" />
        <di:waypoint x="1850" y="935" />
        <di:waypoint x="1825" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0capg8d_di" bpmnElement="Flow_0capg8d">
        <di:waypoint x="1800" y="865" />
        <di:waypoint x="1800" y="910" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0kbk64r_di" bpmnElement="Flow_0kbk64r">
        <di:waypoint x="1965" y="935" />
        <di:waypoint x="1825" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1h3chzl_di" bpmnElement="Flow_1h3chzl">
        <di:waypoint x="1775" y="935" />
        <di:waypoint x="1042" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0f41u3t_di" bpmnElement="Flow_0f41u3t">
        <di:waypoint x="1067" y="778" />
        <di:waypoint x="1067" y="935" />
        <di:waypoint x="1042" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_085cxg4_di" bpmnElement="Flow_085cxg4">
        <di:waypoint x="992" y="935" />
        <di:waypoint x="450" y="935" />
        <di:waypoint x="450" y="555" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0gxpeae_di" bpmnElement="Flow_0gxpeae">
        <di:waypoint x="1990" y="760" />
        <di:waypoint x="1990" y="910" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1jue3vu_di" bpmnElement="Flow_1jue3vu">
        <di:waypoint x="2040" y="778" />
        <di:waypoint x="2040" y="935" />
        <di:waypoint x="2015" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1wmkcba_di" bpmnElement="Flow_1wmkcba">
        <di:waypoint x="2155" y="935" />
        <di:waypoint x="2015" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_107objo_di" bpmnElement="Flow_107objo">
        <di:waypoint x="2180" y="760" />
        <di:waypoint x="2180" y="910" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_14trbud_di" bpmnElement="Flow_14trbud">
        <di:waypoint x="2230" y="778" />
        <di:waypoint x="2230" y="935" />
        <di:waypoint x="2205" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1xshwha_di" bpmnElement="Flow_1xshwha">
        <di:waypoint x="2345" y="935" />
        <di:waypoint x="2205" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1kexgkg_di" bpmnElement="Flow_1kexgkg">
        <di:waypoint x="2370" y="760" />
        <di:waypoint x="2370" y="910" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_089jb48_di" bpmnElement="Flow_089jb48">
        <di:waypoint x="2420" y="778" />
        <di:waypoint x="2420" y="935" />
        <di:waypoint x="2395" y="935" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0ta8l0r_di" bpmnElement="Flow_0ta8l0r">
        <di:waypoint x="1800" y="760" />
        <di:waypoint x="1800" y="815" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0ai5yn9_di" bpmnElement="Flow_0ai5yn9">
        <di:waypoint x="820" y="505" />
        <di:waypoint x="820" y="430" />
        <di:waypoint x="915" y="430" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="788" y="413" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_07cvw4b_di" bpmnElement="Flow_07cvw4b">
        <di:waypoint x="940" y="405" />
        <di:waypoint x="940" y="330" />
        <di:waypoint x="967" y="330" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="960" y="393" width="40" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0uqymo8_di" bpmnElement="Flow_0uqymo8">
        <di:waypoint x="965" y="430" />
        <di:waypoint x="1220" y="430" />
        <di:waypoint x="1220" y="370" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1153" y="403" width="54" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1b87i2y_di" bpmnElement="Flow_1b87i2y">
        <di:waypoint x="965" y="430" />
        <di:waypoint x="1410" y="430" />
        <di:waypoint x="1410" y="370" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1343" y="403" width="45" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0npimy6_di" bpmnElement="Flow_0npimy6">
        <di:waypoint x="965" y="430" />
        <di:waypoint x="1800" y="430" />
        <di:waypoint x="1800" y="370" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1732" y="403" width="62" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1isupnd_di" bpmnElement="Flow_1isupnd">
        <di:waypoint x="965" y="430" />
        <di:waypoint x="2180" y="430" />
        <di:waypoint x="2180" y="370" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2137" y="403" width="36" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0jcxpey_di" bpmnElement="Flow_0jcxpey">
        <di:waypoint x="965" y="430" />
        <di:waypoint x="2370" y="430" />
        <di:waypoint x="2370" y="370" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="2293" y="403" width="68" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0x0ljru_di" bpmnElement="Flow_0x0ljru">
        <di:waypoint x="965" y="430" />
        <di:waypoint x="1610" y="430" />
        <di:waypoint x="1610" y="370" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1525" y="403" width="77" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0cp4o1w_di" bpmnElement="Flow_0cp4o1w">
        <di:waypoint x="1800" y="290" />
        <di:waypoint x="1800" y="235" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_05a32eg_di" bpmnElement="Flow_05a32eg">
        <di:waypoint x="1775" y="210" />
        <di:waypoint x="1738" y="210" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_10c18rc_di" bpmnElement="Flow_10c18rc">
        <di:waypoint x="1800" y="185" />
        <di:waypoint x="1800" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_16h1gqd_di" bpmnElement="Flow_16h1gqd">
        <di:waypoint x="1850" y="272" />
        <di:waypoint x="1850" y="110" />
        <di:waypoint x="1825" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1uutgxx_di" bpmnElement="Flow_1uutgxx">
        <di:waypoint x="2155" y="110" />
        <di:waypoint x="1825" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_09mpkpd_di" bpmnElement="Flow_09mpkpd">
        <di:waypoint x="1775" y="110" />
        <di:waypoint x="1635" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_029xa2q_di" bpmnElement="Flow_029xa2q">
        <di:waypoint x="2230" y="272" />
        <di:waypoint x="2230" y="110" />
        <di:waypoint x="2205" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1uj1qvs_di" bpmnElement="Flow_1uj1qvs">
        <di:waypoint x="2180" y="290" />
        <di:waypoint x="2180" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1hd832p_di" bpmnElement="Flow_1hd832p">
        <di:waypoint x="2345" y="110" />
        <di:waypoint x="2205" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1uaelp8_di" bpmnElement="Flow_1uaelp8">
        <di:waypoint x="2420" y="272" />
        <di:waypoint x="2420" y="110" />
        <di:waypoint x="2395" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1bbt60a_di" bpmnElement="Flow_1bbt60a">
        <di:waypoint x="2370" y="290" />
        <di:waypoint x="2370" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1wfynvr_di" bpmnElement="Flow_1wfynvr">
        <di:waypoint x="1460" y="272" />
        <di:waypoint x="1460" y="110" />
        <di:waypoint x="1435" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0ibwf41_di" bpmnElement="Flow_0ibwf41">
        <di:waypoint x="1410" y="290" />
        <di:waypoint x="1410" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1eimuq7_di" bpmnElement="Flow_1eimuq7">
        <di:waypoint x="1585" y="110" />
        <di:waypoint x="1435" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1a21lky_di" bpmnElement="Flow_1a21lky">
        <di:waypoint x="1385" y="110" />
        <di:waypoint x="1245" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0d99fvj_di" bpmnElement="Flow_0d99fvj">
        <di:waypoint x="1270" y="272" />
        <di:waypoint x="1270" y="110" />
        <di:waypoint x="1245" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1o9vtv2_di" bpmnElement="Flow_1o9vtv2">
        <di:waypoint x="1220" y="290" />
        <di:waypoint x="1220" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1cgosxg_di" bpmnElement="Flow_1cgosxg">
        <di:waypoint x="1195" y="110" />
        <di:waypoint x="1042" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0q7sxmn_di" bpmnElement="Flow_0q7sxmn">
        <di:waypoint x="1067" y="272" />
        <di:waypoint x="1067" y="110" />
        <di:waypoint x="1042" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_13kw7ms_di" bpmnElement="Flow_13kw7ms">
        <di:waypoint x="1017" y="290" />
        <di:waypoint x="1017" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0lddqgd_di" bpmnElement="Flow_0lddqgd">
        <di:waypoint x="992" y="110" />
        <di:waypoint x="450" y="110" />
        <di:waypoint x="450" y="505" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1j86ng8_di" bpmnElement="Flow_1j86ng8">
        <di:waypoint x="1610" y="290" />
        <di:waypoint x="1610" y="135" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0ggrago_di" bpmnElement="Flow_0ggrago">
        <di:waypoint x="1660" y="272" />
        <di:waypoint x="1660" y="110" />
        <di:waypoint x="1635" y="110" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_08g52cy_di" bpmnElement="Flow_08g52cy">
        <di:waypoint x="218" y="530" />
        <di:waypoint x="270" y="530" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_03dawv7_di" bpmnElement="Flow_03dawv7">
        <di:waypoint x="370" y="530" />
        <di:waypoint x="425" y="530" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_05g3f3n_di" bpmnElement="Flow_05g3f3n">
        <di:waypoint x="760" y="530" />
        <di:waypoint x="795" y="530" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0qpcwio_di" bpmnElement="Flow_0qpcwio">
        <di:waypoint x="845" y="530" />
        <di:waypoint x="912" y="530" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="867" y="512" width="23" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0rv0yhc_di" bpmnElement="Flow_0rv0yhc">
        <di:waypoint x="475" y="530" />
        <di:waypoint x="500" y="530" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0s7y4qh_di" bpmnElement="Flow_0s7y4qh">
        <di:waypoint x="370" y="1000" />
        <di:waypoint x="422" y="1000" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0hs17xb_di" bpmnElement="Flow_0hs17xb">
        <di:waypoint x="600" y="530" />
        <di:waypoint x="660" y="530" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_0pz6emc_di" bpmnElement="Flow_0pz6emc">
        <di:waypoint x="218" y="1000" />
        <di:waypoint x="270" y="1000" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="Group_0ccj31g_di" bpmnElement="Group_0ccj31g" bioc:stroke="#6b3c00" bioc:fill="#ffe0b2" color:background-color="#ffe0b2" color:border-color="#6b3c00">
        <dc:Bounds x="870" y="40" width="1640" height="450" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1679" y="47" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="BPMNShape_0vza1ls" bpmnElement="Group_05pjf4m" bioc:stroke="#0d4372" bioc:fill="#bbdefb" color:background-color="#bbdefb" color:border-color="#0d4372">
        <dc:Bounds x="870" y="565" width="1640" height="425" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="1649" y="572" width="84" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
