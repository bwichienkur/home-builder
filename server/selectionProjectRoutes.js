import { z } from 'zod';

const contractSchema = z.object({
  id: z.string(),
  name: z.string(),
  planRef: z.string().optional(),
  lotRef: z.string().optional(),
  baseline: z.literal('platinum'),
  includedLevels: z.array(
    z.object({
      pricingCategory: z.string(),
      sourceTab: z.string().optional(),
      includedLevel: z.string(),
      label: z.string(),
      priceUnit: z.string(),
    }),
  ),
  verifiedAt: z.string(),
  notes: z.string().optional(),
});

const extendedSchema = z.record(z.string(), z.unknown()).optional();

const createSchema = z.object({
  name: z.string().min(1),
  planRef: z.string().optional(),
  lotRef: z.string().optional(),
  contract: contractSchema,
  sceneProjectId: z.string().uuid().optional().nullable(),
  extended: extendedSchema,
});

const updateSchema = createSchema.partial();

function mapRow(row) {
  const extended = row.extended ?? row.workflowJson ?? {};
  return {
    id: row.id,
    name: row.name,
    planRef: row.planRef ?? row.name,
    lotRef: row.lotRef ?? undefined,
    contract: row.contract,
    sceneProjectId: row.sceneProjectId ?? undefined,
    extended,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mountSelectionProjectRoutes(app, pool) {
  app.get('/api/selection-projects', async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const { rows } = await pool.query(
        `SELECT id, name, plan_ref AS "planRef", lot_ref AS "lotRef",
                contract_json AS contract, scene_project_id AS "sceneProjectId",
                workflow_json AS "workflowJson", selections_json AS "selectionsJson", takeoff_json AS "takeoffJson",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM selection_projects
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT 100`,
        [req.userId],
      );
      res.json({
        items: rows.map((row) =>
          mapRow({
            ...row,
            extended: {
              ...(row.workflowJson ?? {}),
              selections: row.selectionsJson ?? {},
              takeoff: row.takeoffJson ?? {},
            },
          }),
        ),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/selection-projects/:id', async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const { rows } = await pool.query(
        `SELECT id, name, plan_ref AS "planRef", lot_ref AS "lotRef",
                contract_json AS contract, scene_project_id AS "sceneProjectId",
                workflow_json AS "workflowJson", selections_json AS "selectionsJson", takeoff_json AS "takeoffJson",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM selection_projects
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId],
      );
      if (!rows[0]) return res.sendStatus(404);
      res.json(
        mapRow({
          ...rows[0],
          extended: {
            ...(rows[0].workflowJson ?? {}),
            selections: rows[0].selectionsJson ?? {},
            takeoff: rows[0].takeoffJson ?? {},
          },
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/selection-projects', async (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const body = parsed.data;
      const extended = body.extended ?? {};
      const { rows } = await pool.query(
        `INSERT INTO selection_projects (user_id, name, plan_ref, lot_ref, contract_json, scene_project_id, workflow_json, selections_json, takeoff_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, plan_ref AS "planRef", lot_ref AS "lotRef",
                   contract_json AS contract, scene_project_id AS "sceneProjectId",
                   workflow_json AS "workflowJson", selections_json AS "selectionsJson", takeoff_json AS "takeoffJson",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          req.userId,
          body.name,
          body.planRef ?? body.name,
          body.lotRef ?? null,
          body.contract,
          body.sceneProjectId ?? null,
          extended,
          extended.selections ?? {},
          extended.takeoff ?? {},
        ],
      );
      res.status(201).json(mapRow({ ...rows[0], extended }));
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/selection-projects/:id', async (req, res, next) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const body = parsed.data;
      const extended = body.extended ?? null;
      const { rows } = await pool.query(
        `UPDATE selection_projects SET
           name = coalesce($3, name),
           plan_ref = coalesce($4, plan_ref),
           lot_ref = coalesce($5, lot_ref),
           contract_json = coalesce($6, contract_json),
           scene_project_id = coalesce($7, scene_project_id),
           workflow_json = coalesce($8, workflow_json),
           selections_json = coalesce($9, selections_json),
           takeoff_json = coalesce($10, takeoff_json),
           updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, name, plan_ref AS "planRef", lot_ref AS "lotRef",
                   contract_json AS contract, scene_project_id AS "sceneProjectId",
                   workflow_json AS "workflowJson", selections_json AS "selectionsJson", takeoff_json AS "takeoffJson",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          req.params.id,
          req.userId,
          body.name ?? null,
          body.planRef ?? null,
          body.lotRef ?? null,
          body.contract ?? null,
          body.sceneProjectId ?? null,
          extended,
          extended?.selections ?? null,
          extended?.takeoff ?? null,
        ],
      );
      if (!rows[0]) return res.sendStatus(404);
      res.json(mapRow({ ...rows[0], extended: extended ?? rows[0].workflowJson ?? {} }));
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/selection-projects/:id', async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const { rowCount } = await pool.query(
        'DELETE FROM selection_projects WHERE id = $1 AND user_id = $2',
        [req.params.id, req.userId],
      );
      if (!rowCount) return res.sendStatus(404);
      res.sendStatus(204);
    } catch (e) {
      next(e);
    }
  });
}
