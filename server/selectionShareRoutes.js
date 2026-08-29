import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const inviteSchema = z.object({
  clientEmail: z.string().email().optional(),
  expiresInDays: z.number().min(1).max(90).optional(),
});

const sharedUpdateSchema = z.object({
  extended: z.record(z.string(), z.unknown()),
});

function mapShared(row) {
  const extended = {
    ...(row.workflowJson ?? {}),
    selections: row.selectionsJson ?? {},
    takeoff: row.takeoffJson ?? {},
  };
  return {
    id: row.id,
    name: row.name,
    planRef: row.planRef ?? row.name,
    lotRef: row.lotRef ?? undefined,
    contract: row.contract,
    sceneProjectId: row.sceneProjectId ?? undefined,
    extended,
    shareToken: row.shareToken,
    clientEmail: row.clientEmail ?? undefined,
    shareExpiresAt: row.shareExpiresAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Public client-share routes (no owner auth). Mount before auth middleware. */
export function mountSelectionShareRoutes(app, pool) {
  app.get('/api/selection-projects/shared/:token', async (req, res, next) => {
    try {
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const { rows } = await pool.query(
        `SELECT id, name, plan_ref AS "planRef", lot_ref AS "lotRef",
                contract_json AS contract, scene_project_id AS "sceneProjectId",
                workflow_json AS "workflowJson", selections_json AS "selectionsJson", takeoff_json AS "takeoffJson",
                share_token AS "shareToken", client_email AS "clientEmail", share_expires_at AS "shareExpiresAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM selection_projects
         WHERE share_token = $1
           AND (share_expires_at IS NULL OR share_expires_at > now())`,
        [req.params.token],
      );
      if (!rows[0]) return res.sendStatus(404);
      res.json(mapShared(rows[0]));
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/selection-projects/shared/:token', async (req, res, next) => {
    try {
      const parsed = sharedUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const extended = parsed.data.extended;
      const { rows } = await pool.query(
        `UPDATE selection_projects SET
           workflow_json = coalesce($2, workflow_json),
           selections_json = coalesce($3, selections_json),
           updated_at = now()
         WHERE share_token = $1
           AND (share_expires_at IS NULL OR share_expires_at > now())
         RETURNING id, name, plan_ref AS "planRef", lot_ref AS "lotRef",
                   contract_json AS contract, scene_project_id AS "sceneProjectId",
                   workflow_json AS "workflowJson", selections_json AS "selectionsJson", takeoff_json AS "takeoffJson",
                   share_token AS "shareToken", client_email AS "clientEmail", share_expires_at AS "shareExpiresAt",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [req.params.token, extended, extended.selections ?? null],
      );
      if (!rows[0]) return res.sendStatus(404);
      res.json(mapShared(rows[0]));
    } catch (e) {
      next(e);
    }
  });
}

/** Owner invite endpoint — mount with authenticated selection routes. */
export function mountSelectionInviteRoutes(app, pool) {
  app.post('/api/selection-projects/:id/invite', async (req, res, next) => {
    try {
      const parsed = inviteSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
      const token = randomBytes(18).toString('base64url');
      const days = parsed.data.expiresInDays ?? 30;
      const { rows } = await pool.query(
        `UPDATE selection_projects SET
           share_token = $3,
           share_expires_at = now() + ($4 || ' days')::interval,
           client_email = coalesce($5, client_email),
           updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING share_token AS "shareToken", share_expires_at AS "shareExpiresAt", client_email AS "clientEmail"`,
        [req.params.id, req.userId, token, String(days), parsed.data.clientEmail ?? null],
      );
      if (!rows[0]) return res.sendStatus(404);
      const origin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
      const shareUrl = `${origin}/build?share=${rows[0].shareToken}`;
      res.json({
        ...rows[0],
        shareUrl,
        note: 'Copy this link to the client. Email delivery is not configured — paste into an invite message.',
      });
    } catch (e) {
      next(e);
    }
  });
}
