const express = require('express');
const router = express.Router();
const db = require('../config/db.config');

// Utility function to convert snake_case to camelCase
const snakeToCamel = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Transform object keys from snake_case to camelCase
const transformToCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(item => transformToCamelCase(item));
  }
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const transformed = {};
  for (const key in obj) {
    const camelKey = snakeToCamel(key);
    transformed[camelKey] = transformToCamelCase(obj[key]);
  }
  return transformed;
};

router.get('/workflows', async (req, res) => {
  try {
    console.log('Fetching all workflows from database...');
    const [rows] = await db.query(
      'SELECT wm.workflow_master_id, wm.wfd_name, wm.wfd_desc, wm.wfd_status, ' +
      'ws.idwfd_stages, ws.wf_id, ws.seq_no, ws.stage_name, ws.stage_desc, ws.no_of_uploads, ' +
      'ws.actor_type, ws.actor_count, ws.any_all_flag, ws.conflict_check, ws.document_required, ' +
      'ws.role_id, ws.user_id ' +
      'FROM wfd_workflow_master wm ' +
      'LEFT JOIN wfd_stages ws ON wm.workflow_master_id = ws.wf_id ' +
      'ORDER BY wm.workflow_master_id, ws.seq_no'
    );

    const workflows = {};
    for (const row of rows) {
      const transformedRow = transformToCamelCase(row);
      if (!workflows[transformedRow.workflowMasterId]) {
        workflows[transformedRow.workflowMasterId] = {
          workflowMasterId: transformedRow.workflowMasterId,
          wfdName: transformedRow.wfdName,
          wfdDesc: transformedRow.wfdDesc,
          wfdStatus: transformedRow.wfdStatus,
          stages: [],
        };
      }
      if (transformedRow.idwfdStages) {
        console.log(`Fetching actions for stage ${transformedRow.idwfdStages} in workflow ${transformedRow.workflowMasterId}`);
        const [actions] = await db.query(
          'SELECT idwfd_stages_actions, stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id ' +
          'FROM wfd_stages_actions WHERE stage_id = ?',
          [transformedRow.idwfdStages]
        );
        const transformedActions = actions.map(action => transformToCamelCase(action));
        workflows[transformedRow.workflowMasterId].stages.push({
          idwfdStages: transformedRow.idwfdStages,
          wfId: transformedRow.wfId,
          seqNo: transformedRow.seqNo,
          stageName: transformedRow.stageName,
          stageDesc: transformedRow.stageDesc,
          noOfUploads: transformedRow.noOfUploads,
          actorType: transformedRow.actorType,
          actorCount: transformedRow.actorCount,
          anyAllFlag: transformedRow.anyAllFlag,
          conflictCheck: transformedRow.conflictCheck,
          documentRequired: transformedRow.documentRequired,
          roleId: transformedRow.roleId,
          userId: transformedRow.userId,
          actions: transformedActions,
        });
      }
    }

    const workflowList = Object.values(workflows);
    console.log('Workflows fetched successfully:', workflowList);
    res.json(workflowList.length > 0 ? workflowList : []);
  } catch (error) {
    console.error('Error fetching workflows:', error.stack);
    res.status(500).json({ message: `Failed to fetch workflows: ${error.message}` });
  }
});

router.get('/workflows/:id', async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`Fetching workflow with ID: ${id}`);
    const [rows] = await db.query(
      'SELECT wm.workflow_master_id, wm.wfd_name, wm.wfd_desc, wm.wfd_status, ' +
      'ws.idwfd_stages, ws.wf_id, ws.seq_no, ws.stage_name, ws.stage_desc, ws.no_of_uploads, ' +
      'ws.actor_type, ws.actor_count, ws.any_all_flag, ws.conflict_check, ws.document_required, ' +
      'ws.role_id, ws.user_id ' +
      'FROM wfd_workflow_master wm ' +
      'LEFT JOIN wfd_stages ws ON wm.workflow_master_id = ws.wf_id ' +
      'WHERE wm.workflow_master_id = ? ' +
      'ORDER BY ws.seq_no',
      [id]
    );

    if (rows.length === 0) {
      console.log(`Workflow with ID ${id} not found`);
      return res.status(404).json({ message: 'Workflow not found' });
    }

    const transformedRows = rows.map(row => transformToCamelCase(row));
    const workflow = {
      workflowMasterId: transformedRows[0].workflowMasterId,
      wfdName: transformedRows[0].wfdName,
      wfdDesc: transformedRows[0].wfdDesc,
      wfdStatus: transformedRows[0].wfdStatus,
      stages: [],
    };

    for (const row of transformedRows) {
      if (row.idwfdStages) {
        console.log(`Fetching actions for stage ${row.idwfdStages}`);
        const [actions] = await db.query(
          'SELECT idwfd_stages_actions, stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id ' +
          'FROM wfd_stages_actions WHERE stage_id = ?',
          [row.idwfdStages]
        );
        const transformedActions = actions.map(action => transformToCamelCase(action));
        workflow.stages.push({
          idwfdStages: row.idwfdStages,
          wfId: row.wfId,
          seqNo: row.seqNo,
          stageName: row.stageName,
          stageDesc: row.stageDesc,
          noOfUploads: row.noOfUploads,
          actorType: row.actorType,
          actorCount: row.actorCount,
          anyAllFlag: row.anyAllFlag,
          conflictCheck: row.conflictCheck,
          documentRequired: row.documentRequired,
          roleId: row.roleId,
          userId: row.userId,
          actions: transformedActions,
        });
      }
    }

    console.log('Workflow fetched successfully:', workflow);
    console.log('Stage IDs in workflow:', workflow.stages.map(stage => stage.idwfdStages));
    res.json(workflow);
  } catch (error) {
    console.error('Error fetching workflow:', error.stack);
    res.status(500).json({ message: `Failed to fetch workflow: ${error.message}` });
  }
});

router.get('/workflows/:id/stages/:stageId', async (req, res) => {
  const { id, stageId } = req.params;
  try {
    console.log(`Fetching stage ${stageId} for workflow ${id}`);
    const [rows] = await db.query(
      'SELECT idwfd_stages, wf_id, seq_no, stage_name, stage_desc, no_of_uploads, ' +
      'actor_type, actor_count, any_all_flag, conflict_check, document_required, ' +
      'role_id, user_id ' +
      'FROM wfd_stages ' +
      'WHERE idwfd_stages = ? AND wf_id = ?',
      [stageId, id]
    );

    if (rows.length === 0) {
      console.log(`Stage ${stageId} not found in workflow ${id}`);
      return res.status(404).json({ message: 'Stage not found' });
    }

    const transformedRow = transformToCamelCase(rows[0]);
    console.log(`Fetching actions for stage ${stageId}`);
    const [actions] = await db.query(
      'SELECT idwfd_stages_actions, stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id ' +
      'FROM wfd_stages_actions WHERE stage_id = ?',
      [stageId]
    );
    const transformedActions = actions.map(action => transformToCamelCase(action));

    const stage = {
      idwfdStages: transformedRow.idwfdStages,
      wfId: transformedRow.wfId,
      seqNo: transformedRow.seqNo,
      stageName: transformedRow.stageName,
      stageDesc: transformedRow.stageDesc,
      noOfUploads: transformedRow.noOfUploads,
      actorType: transformedRow.actorType,
      actorCount: transformedRow.actorCount,
      anyAllFlag: transformedRow.anyAllFlag,
      conflictCheck: transformedRow.conflictCheck,
      documentRequired: transformedRow.documentRequired,
      roleId: transformedRow.roleId,
      userId: transformedRow.userId,
      actions: transformedActions,
    };

    console.log('Stage fetched successfully:', stage);
    res.json(stage);
  } catch (error) {
    console.error('Error fetching stage:', error.stack);
    res.status(500).json({ message: `Failed to fetch stage: ${error.message}` });
  }
});

router.post('/workflows', async (req, res) => {
  const { wfdName, wfdDesc, wfdStatus } = req.body;
  try {
    // Validate inputs
    if (!wfdName || typeof wfdName !== 'string') {
      return res.status(400).json({ message: 'wfdName is required and must be a string' });
    }
    if (!wfdDesc || typeof wfdDesc !== 'string') {
      return res.status(400).json({ message: 'wfdDesc is required and must be a string' });
    }
    const validStatuses = ['active', 'inactive'];
    if (!validStatuses.includes(wfdStatus)) {
      console.log(`Invalid wfdStatus value: ${wfdStatus}. Expected one of: ${validStatuses.join(', ')}`);
      return res.status(400).json({ message: `Invalid wfdStatus value: ${wfdStatus}. Expected one of: ${validStatuses.join(', ')}` });
    }

    console.log('Creating new workflow with:', { wfdName, wfdDesc, wfdStatus });
    const [result] = await db.query(
      'INSERT INTO wfd_workflow_master (wfd_name, wfd_desc, wfd_status) VALUES (?, ?, ?)',
      [wfdName, wfdDesc, wfdStatus]
    );
    const newWorkflow = {
      workflowMasterId: result.insertId,
      wfdName,
      wfdDesc,
      wfdStatus,
      stages: [],
    };
    console.log('New workflow created:', newWorkflow);
    res.json(newWorkflow);
  } catch (error) {
    console.error('Error creating workflow:', error.stack);
    res.status(500).json({ message: `Failed to create workflow: ${error.message}` });
  }
});

router.put('/workflows/:id', async (req, res) => {
  const { id } = req.params;
  const { wfdName, wfdDesc, wfdStatus } = req.body;
  try {
    // Validate inputs
    if (!wfdName || typeof wfdName !== 'string') {
      return res.status(400).json({ message: 'wfdName is required and must be a string' });
    }
    if (!wfdDesc || typeof wfdDesc !== 'string') {
      return res.status(400).json({ message: 'wfdDesc is required and must be a string' });
    }
    const validStatuses = ['active', 'inactive'];
    if (!validStatuses.includes(wfdStatus)) {
      console.log(`Invalid wfdStatus value: ${wfdStatus}. Expected one of: ${validStatuses.join(', ')}`);
      return res.status(400).json({ message: `Invalid wfdStatus value: ${wfdStatus}. Expected one of: ${validStatuses.join(', ')}` });
    }

    console.log(`Updating workflow ${id} with:`, { wfdName, wfdDesc, wfdStatus });
    const [result] = await db.query(
      'UPDATE wfd_workflow_master SET wfd_name = ?, wfd_desc = ?, wfd_status = ? WHERE workflow_master_id = ?',
      [wfdName, wfdDesc, wfdStatus, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Workflow not found' });
    }
    const updatedWorkflow = {
      workflowMasterId: parseInt(id),
      wfdName,
      wfdDesc,
      wfdStatus,
      stages: [],
    };
    console.log('Workflow updated successfully:', updatedWorkflow);
    res.json(updatedWorkflow);
  } catch (error) {
    console.error('Error updating workflow:', error.stack);
    res.status(500).json({ message: `Failed to update workflow: ${error.message}` });
  }
});

router.delete('/workflows/:id', async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`Deleting workflow with ID: ${id}`);

    // Step 1: Delete actions associated with the stages of this workflow
    console.log(`Deleting actions for stages of workflow ${id}`);
    const [stages] = await connection.query('SELECT idwfd_stages FROM wfd_stages WHERE wf_id = ?', [id]);
    if (stages.length > 0) {
      const stageIds = stages.map(stage => stage.idwfd_stages);
      await connection.query('DELETE FROM wfd_stages_actions WHERE stage_id IN (?)', [stageIds]);
    }

    // Step 2: Delete the stages of this workflow
    console.log(`Deleting stages for workflow ${id}`);
    await connection.query('DELETE FROM wfd_stages WHERE wf_id = ?', [id]);

    // Step 3: Delete the workflow itself
    console.log(`Deleting workflow ${id} from wfd_workflow_master`);
    const [result] = await connection.query('DELETE FROM wfd_workflow_master WHERE workflow_master_id = ?', [id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Workflow not found' });
    }

    await connection.commit();
    console.log(`Workflow ${id} deleted successfully`);
    res.status(204).send();
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting workflow:', error.stack);
    res.status(500).json({ message: `Failed to delete workflow: ${error.message}` });
  } finally {
    connection.release();
  }
});

// New endpoint to copy a workflow
router.post('/workflows/:id/copy', async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`Copying workflow with ID: ${id}`);

    // Step 1: Fetch the existing workflow
    const [workflowRows] = await connection.query(
      'SELECT workflow_master_id, wfd_name, wfd_desc, wfd_status ' +
      'FROM wfd_workflow_master WHERE workflow_master_id = ?',
      [id]
    );

    if (workflowRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Workflow not found' });
    }

    const originalWorkflow = transformToCamelCase(workflowRows[0]);

    // Step 2: Create a new workflow with modified name
    const newWorkflowData = {
      wfdName: `${originalWorkflow.wfdName} (Copy)`,
      wfdDesc: originalWorkflow.wfdDesc,
      wfdStatus: originalWorkflow.wfdStatus,
    };

    const [workflowResult] = await connection.query(
      'INSERT INTO wfd_workflow_master (wfd_name, wfd_desc, wfd_status) VALUES (?, ?, ?)',
      [newWorkflowData.wfdName, newWorkflowData.wfdDesc, newWorkflowData.wfdStatus]
    );
    const newWorkflowId = workflowResult.insertId;
    console.log(`New workflow created with ID: ${newWorkflowId}`);

    // Step 3: Fetch the stages of the original workflow
    const [stageRows] = await connection.query(
      'SELECT idwfd_stages, wf_id, seq_no, stage_name, stage_desc, no_of_uploads, ' +
      'actor_type, actor_count, any_all_flag, conflict_check, document_required, ' +
      'role_id, user_id ' +
      'FROM wfd_stages WHERE wf_id = ? ORDER BY seq_no',
      [id]
    );

    const newStages = [];
    const stageMapping = new Map(); // Map old stage IDs to new stage IDs

    // Step 4: Copy each stage and its actions
    for (const stage of stageRows) {
      const transformedStage = transformToCamelCase(stage);

      // Insert the new stage
      const [stageResult] = await connection.query(
        'INSERT INTO wfd_stages (wf_id, seq_no, stage_name, stage_desc, no_of_uploads, actor_type, actor_count, any_all_flag, conflict_check, document_required, role_id, user_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newWorkflowId,
          transformedStage.seqNo,
          transformedStage.stageName,
          transformedStage.stageDesc,
          transformedStage.noOfUploads,
          transformedStage.actorType,
          transformedStage.actorCount,
          transformedStage.anyAllFlag,
          transformedStage.conflictCheck,
          transformedStage.documentRequired,
          transformedStage.roleId,
          transformedStage.userId,
        ]
      );
      const newStageId = stageResult.insertId;
      stageMapping.set(transformedStage.idwfdStages, newStageId);

      // Fetch actions for the current stage
      const [actionRows] = await connection.query(
        'SELECT idwfd_stages_actions, stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id ' +
        'FROM wfd_stages_actions WHERE stage_id = ?',
        [transformedStage.idwfdStages]
      );

      const transformedActions = actionRows.map(action => transformToCamelCase(action));
      const newActions = [];

      // Copy actions for the stage
      for (const action of transformedActions) {
        const newNextStageId = action.nextStageType === 'specific' && action.nextStageId
          ? stageMapping.get(action.nextStageId) || null
          : null;

        const [actionResult] = await connection.query(
          'INSERT INTO wfd_stages_actions (stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            newStageId,
            action.actionName,
            action.actionDesc,
            action.nextStageType,
            newNextStageId,
            action.requiredCount,
            action.roleId,
            action.userId,
          ]
        );

        newActions.push({
          idwfdStagesActions: actionResult.insertId,
          stageId: newStageId,
          actionName: action.actionName,
          actionDesc: action.actionDesc,
          nextStageType: action.nextStageType,
          nextStageId: newNextStageId,
          requiredCount: action.requiredCount,
          roleId: action.roleId,
          userId: action.userId,
        });
      }

      newStages.push({
        idwfdStages: newStageId,
        wfId: newWorkflowId,
        seqNo: transformedStage.seqNo,
        stageName: transformedStage.stageName,
        stageDesc: transformedStage.stageDesc,
        noOfUploads: transformedStage.noOfUploads,
        actorType: transformedStage.actorType,
        actorCount: transformedStage.actorCount,
        anyAllFlag: transformedStage.anyAllFlag,
        conflictCheck: transformedStage.conflictCheck,
        documentRequired: transformedStage.documentRequired,
        roleId: transformedStage.roleId,
        userId: transformedStage.userId,
        actions: newActions,
      });
    }

    // Step 5: Construct the new workflow response
    const newWorkflow = {
      workflowMasterId: newWorkflowId,
      wfdName: newWorkflowData.wfdName,
      wfdDesc: newWorkflowData.wfdDesc,
      wfdStatus: newWorkflowData.wfdStatus,
      stages: newStages,
    };

    await connection.commit();
    console.log('Workflow copied successfully:', newWorkflow);
    res.status(201).json(newWorkflow);
  } catch (error) {
    await connection.rollback();
    console.error('Error copying workflow:', error.stack);
    res.status(500).json({ message: `Failed to copy workflow: ${error.message}` });
  } finally {
    connection.release();
  }
});

router.post('/workflows/:id/stages', async (req, res) => {
  const { id } = req.params;
  const { seqNo, stageName, stageDesc, noOfUploads, actorType, actorCount, anyAllFlag, conflictCheck, documentRequired, roleId, userId, actions } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`Adding stage to workflow ${id} with:`, { seqNo, stageName, stageDesc, noOfUploads, actorType, actorCount, anyAllFlag, conflictCheck, documentRequired, roleId, userId, actions });

    // Validate inputs
    if (!stageName || typeof stageName !== 'string') {
      throw new Error('stageName is required and must be a string');
    }
    if (!stageDesc || typeof stageDesc !== 'string') {
      throw new Error('stageDesc is required and must be a string');
    }
    if (typeof seqNo !== 'number' || seqNo < 1) {
      throw new Error('seqNo must be a positive number');
    }
    if (typeof noOfUploads !== 'number' || noOfUploads < 0) {
      throw new Error('noOfUploads must be a non-negative number');
    }
    if (!['role', 'user'].includes(actorType)) {
      throw new Error('actorType must be either "role" or "user"');
    }
    if (actorType === 'role' && !roleId) {
      throw new Error('roleId is required when actorType is role');
    }
    if (actorType === 'user' && !userId) {
      throw new Error('userId is required when actorType is user');
    }
    if (typeof actorCount !== 'number' || actorCount < 1) {
      throw new Error('actorCount must be a positive number');
    }
    if (!['any', 'all'].includes(anyAllFlag)) {
      throw new Error('anyAllFlag must be either "any" or "all"');
    }
    if (typeof conflictCheck !== 'number' || ![0, 1].includes(conflictCheck)) {
      throw new Error('conflictCheck must be 0 or 1');
    }
    if (typeof documentRequired !== 'number' || ![0, 1].includes(documentRequired)) {
      throw new Error('documentRequired must be 0 or 1');
    }

    // Validate actions
    if (actions && Array.isArray(actions)) {
      const validNextStageTypes = ['next', 'prev', 'complete', 'specific'];
      const [existingStages] = await connection.query('SELECT idwfd_stages FROM wfd_stages WHERE wf_id = ?', [id]);
      const stageIds = existingStages.map(stage => stage.idwfd_stages);

      for (const action of actions) {
        if (!action.actionName || typeof action.actionName !== 'string') {
          throw new Error('actionName is required and must be a string for all actions');
        }
        if (!validNextStageTypes.includes(action.nextStageType)) {
          throw new Error(`nextStageType must be one of: ${validNextStageTypes.join(', ')}`);
        }
        if (action.nextStageType === 'specific') {
          if (!action.nextStageId || typeof action.nextStageId !== 'number') {
            throw new Error('nextStageId is required and must be a number when nextStageType is "specific"');
          }
          if (!stageIds.includes(action.nextStageId)) {
            throw new Error(`nextStageId ${action.nextStageId} does not correspond to an existing stage in workflow ${id}`);
          }
        }
        if (typeof action.requiredCount !== 'number' || action.requiredCount < 1 || action.requiredCount > actorCount) {
          throw new Error(`requiredCount must be a number between 1 and ${actorCount}`);
        }
      }
    }

    const [result] = await connection.query(
      'INSERT INTO wfd_stages (wf_id, seq_no, stage_name, stage_desc, no_of_uploads, actor_type, actor_count, any_all_flag, conflict_check, document_required, role_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, seqNo, stageName, stageDesc, noOfUploads, actorType, actorCount, anyAllFlag, conflictCheck, documentRequired, roleId, userId]
    );
    const stageId = result.insertId;
    console.log(`Stage created with ID: ${stageId}`);

    let transformedActions = [];
    if (actions && Array.isArray(actions)) {
      console.log('Inserting actions for stage:', stageId);
      const actionQueries = actions.map(action => {
        console.log('Inserting action:', action);
        return connection.query(
          'INSERT INTO wfd_stages_actions (stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [stageId, action.actionName, action.actionDesc || null, action.nextStageType, action.nextStageType === 'specific' ? action.nextStageId : null, action.requiredCount || 1, null, null]
        );
      });
      const actionResults = await Promise.all(actionQueries);
      transformedActions = actions.map((action, index) => ({
        idwfdStagesActions: actionResults[index][0].insertId,
        stageId: stageId,
        actionName: action.actionName,
        actionDesc: action.actionDesc || null,
        nextStageType: action.nextStageType,
        nextStageId: action.nextStageType === 'specific' ? action.nextStageId : null,
        requiredCount: action.requiredCount || 1,
        roleId: null,
        userId: null,
      }));
      console.log('Transformed actions for response:', transformedActions);
    }

    const response = {
      idwfdStages: stageId,
      wfId: parseInt(id),
      seqNo,
      stageName,
      stageDesc,
      noOfUploads,
      actorType,
      actorCount,
      anyAllFlag,
      conflictCheck,
      documentRequired,
      roleId,
      userId,
      actions: transformedActions,
    };

    await connection.commit();
    console.log('Stage added successfully, sending response:', response);
    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('Error adding stage:', error.stack);
    res.status(error.message.includes('is required') || error.message.includes('must be') ? 400 : 500).json({ message: `Failed to add stage: ${error.message}` });
  } finally {
    connection.release();
  }
});

router.put('/workflows/:id/stages/:stageId', async (req, res) => {
  const { id, stageId } = req.params;
  const { seqNo, stageName, stageDesc, noOfUploads, actorType, actorCount, anyAllFlag, conflictCheck, documentRequired, roleId, userId, actions } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`Updating stage ${stageId} in workflow ${id} with:`, { seqNo, stageName, stageDesc, noOfUploads, actorType, actorCount, anyAllFlag, conflictCheck, documentRequired, roleId, userId, actions });

    // Validate inputs
    if (!stageName || typeof stageName !== 'string') {
      throw new Error('stageName is required and must be a string');
    }
    if (!stageDesc || typeof stageDesc !== 'string') {
      throw new Error('stageDesc is required and must be a string');
    }
    if (typeof seqNo !== 'number' || seqNo < 1) {
      throw new Error('seqNo must be a positive number');
    }
    if (typeof noOfUploads !== 'number' || noOfUploads < 0) {
      throw new Error('noOfUploads must be a non-negative number');
    }
    if (!['role', 'user'].includes(actorType)) {
      throw new Error('actorType must be either "role" or "user"');
    }
    if (actorType === 'role' && !roleId) {
      throw new Error('roleId is required when actorType is role');
    }
    if (actorType === 'user' && !userId) {
      throw new Error('userId is required when actorType is user');
    }
    if (typeof actorCount !== 'number' || actorCount < 1) {
      throw new Error('actorCount must be a positive number');
    }
    if (!['any', 'all'].includes(anyAllFlag)) {
      throw new Error('anyAllFlag must be either "any" or "all"');
    }
    if (typeof conflictCheck !== 'number' || ![0, 1].includes(conflictCheck)) {
      throw new Error('conflictCheck must be 0 or 1');
    }
    if (typeof documentRequired !== 'number' || ![0, 1].includes(documentRequired)) {
      throw new Error('documentRequired must be 0 or 1');
    }

    // Validate actions
    if (actions && Array.isArray(actions)) {
      const validNextStageTypes = ['next', 'prev', 'complete', 'specific'];
      const [existingStages] = await connection.query('SELECT idwfd_stages FROM wfd_stages WHERE wf_id = ? AND idwfd_stages != ?', [id, stageId]);
      const stageIds = existingStages.map(stage => stage.idwfd_stages);

      for (const action of actions) {
        if (!action.actionName || typeof action.actionName !== 'string') {
          throw new Error('actionName is required and must be a string for all actions');
        }
        if (!validNextStageTypes.includes(action.nextStageType)) {
          throw new Error(`nextStageType must be one of: ${validNextStageTypes.join(', ')}`);
        }
        if (action.nextStageType === 'specific') {
          if (!action.nextStageId || typeof action.nextStageId !== 'number') {
            throw new Error('nextStageId is required and must be a number when nextStageType is "specific"');
          }
          if (!stageIds.includes(action.nextStageId)) {
            throw new Error(`nextStageId ${action.nextStageId} does not correspond to an existing stage in workflow ${id}`);
          }
        }
        if (typeof action.requiredCount !== 'number' || action.requiredCount < 1 || action.requiredCount > actorCount) {
          throw new Error(`requiredCount must be a number between 1 and ${actorCount}`);
        }
      }
    }

    const [updateResult] = await connection.query(
      'UPDATE wfd_stages SET seq_no = ?, stage_name = ?, stage_desc = ?, no_of_uploads = ?, actor_type = ?, actor_count = ?, any_all_flag = ?, conflict_check = ?, document_required = ?, role_id = ?, user_id = ? WHERE idwfd_stages = ? AND wf_id = ?',
      [seqNo, stageName, stageDesc, noOfUploads, actorType, actorCount, anyAllFlag, conflictCheck, documentRequired, roleId, userId, stageId, id]
    );
    if (updateResult.affectedRows === 0) {
      throw new Error('Stage not found');
    }

    console.log('Deleting existing actions for stage:', stageId);
    await connection.query('DELETE FROM wfd_stages_actions WHERE stage_id = ?', [stageId]);

    let transformedActions = [];
    if (actions && Array.isArray(actions)) {
      console.log('Inserting updated actions for stage:', stageId);
      const actionQueries = actions.map(action => {
        console.log('Inserting updated action:', action);
        return connection.query(
          'INSERT INTO wfd_stages_actions (stage_id, action_name, action_desc, next_stage_type, next_stage_id, required_count, role_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [stageId, action.actionName, action.actionDesc || null, action.nextStageType, action.nextStageType === 'specific' ? action.nextStageId : null, action.requiredCount || 1, null, null]
        );
      });
      const actionResults = await Promise.all(actionQueries);
      transformedActions = actions.map((action, index) => ({
        idwfdStagesActions: actionResults[index][0].insertId,
        stageId: parseInt(stageId),
        actionName: action.actionName,
        actionDesc: action.actionDesc || null,
        nextStageType: action.nextStageType,
        nextStageId: action.nextStageType === 'specific' ? action.nextStageId : null,
        requiredCount: action.requiredCount || 1,
        roleId: null,
        userId: null,
      }));
      console.log('Transformed updated actions for response:', transformedActions);
    }

    const response = {
      idwfdStages: parseInt(stageId),
      wfId: parseInt(id),
      seqNo,
      stageName,
      stageDesc,
      noOfUploads,
      actorType,
      actorCount,
      anyAllFlag,
      conflictCheck,
      documentRequired,
      roleId,
      userId,
      actions: transformedActions,
    };

    await connection.commit();
    console.log('Stage updated successfully, sending response:', response);
    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating stage:', error.stack);
    res.status(error.message.includes('is required') || error.message.includes('must be') || error.message.includes('not found') ? 400 : 500).json({ message: `Failed to update stage: ${error.message}` });
  } finally {
    connection.release();
  }
});

router.delete('/workflows/:id/stages/:stageId', async (req, res) => {
  const { id, stageId } = req.params;
  try {
    console.log(`Deleting stage ${stageId} from workflow ${id}`);
    await db.query('DELETE FROM wfd_stages_actions WHERE stage_id = ?', [stageId]);
    const [result] = await db.query('DELETE FROM wfd_stages WHERE idwfd_stages = ? AND wf_id = ?', [stageId, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Stage not found' });
    }
    console.log(`Stage ${stageId} deleted successfully`);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting stage:', error.stack);
    res.status(500).json({ message: `Failed to delete stage: ${error.message}` });
  }
});

router.get('/roles', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT idrb_role_master, rb_role_name FROM rb_role_master');
    const transformedRows = rows.map(row => transformToCamelCase(row));
    res.json(transformedRows);
  } catch (err) {
    console.error('Error fetching roles:', err.stack);
    res.status(500).json({ message: 'Failed to fetch roles', error: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    console.log('Fetching users from rb_user_master...');
    const [rows] = await db.query('SELECT idrb_user_master, user_name FROM rb_user_master');
    console.log('Users fetched:', rows);
    const transformedRows = rows.map(row => transformToCamelCase(row));
    res.json(transformedRows);
  } catch (err) {
    console.error('Error fetching users:', err.stack);
    res.status(500).json({ message: 'Failed to fetch users', error: err.message });
  }
});

module.exports = router;