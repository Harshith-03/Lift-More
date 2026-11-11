import { Router } from 'express';
import { currentUser, type AppContext } from '../context';
import { notFound, parse } from '../errors';
import { coachAskBody, coachReviewBody } from '../validation';

export function coachRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/status', async (req, res) => {
    res.json(await ctx.coach.status(currentUser(req)));
  });

  r.get('/review', async (req, res) => {
    const review = await ctx.coach.latestReview(currentUser(req));
    if (!review) throw notFound('Coach review for this week');
    res.json(review);
  });

  r.post('/review', async (req, res) => {
    const { force } = parse(coachReviewBody, req.body ?? {});
    res.json(await ctx.coach.review(currentUser(req), { force }));
  });

  r.post('/ask', async (req, res) => {
    const { question } = parse(coachAskBody, req.body);
    res.json(await ctx.coach.ask(currentUser(req), question));
  });

  return r;
}
