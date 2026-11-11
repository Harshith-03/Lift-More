import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { clearSessionCookie } from '../auth/session';
import { currentUser, type AppContext } from '../context';
import { forbidden, parse, unauthorized } from '../errors';
import { findUserById, updateUserSettings } from '../repo/users';
import { deleteAccountSchema, settingsPatchSchema } from '../validation';

export function meRouter(ctx: AppContext): Router {
  const r = Router();

  r.patch('/', async (req, res) => {
    const user = currentUser(req);
    const patch = parse(settingsPatchSchema, req.body ?? {});
    res.json(await updateUserSettings(ctx.db, user.id, patch));
  });

  /** Permanently deletes the account; every table cascades from users. */
  r.delete('/', async (req, res) => {
    const user = currentUser(req);
    const { password } = parse(deleteAccountSchema, req.body ?? {});
    const row = await findUserById(ctx.db, user.id);
    if (!row) throw unauthorized();
    // 403 (not 401) so the client doesn't treat a typo as "session expired".
    if (!(await bcrypt.compare(password, row.password_hash))) throw forbidden('Password is incorrect');
    await ctx.db.query('DELETE FROM users WHERE id = $1', [user.id]);
    clearSessionCookie(ctx, res);
    res.status(204).end();
  });

  return r;
}
