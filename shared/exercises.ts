import type { Equipment, Exercise, Mechanic, MuscleGroup, TrackingType } from './types';

/**
 * Built-in exercise library. Order matters: within a muscle group the staples come first, which
 * the engine uses as a deterministic tie-breaker for search, alternatives and recommendations.
 */
type Row = [
  id: string,
  name: string,
  primary: MuscleGroup,
  secondary: MuscleGroup[],
  equipment: Equipment,
  mechanic: Mechanic,
  tracking: TrackingType,
  cue: string,
];

const W: TrackingType = 'weight_reps';
const BW: TrackingType = 'bodyweight_reps';
const T: TrackingType = 'duration';

const ROWS: Row[] = [
  // ── Chest ──
  ['barbell-bench-press', 'Barbell Bench Press', 'chest', ['triceps', 'shoulders'], 'barbell', 'compound', W, 'Shoulder blades pinned, feet planted; lower to mid-chest and press back over the shoulders.'],
  ['incline-barbell-bench-press', 'Incline Barbell Bench Press', 'chest', ['shoulders', 'triceps'], 'barbell', 'compound', W, 'Bench at 30°; touch the upper chest and keep elbows slightly tucked.'],
  ['dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders'], 'dumbbell', 'compound', W, 'Lower the dumbbells to chest level with a deep stretch, then press up and slightly in.'],
  ['incline-dumbbell-press', 'Incline Dumbbell Press', 'chest', ['shoulders', 'triceps'], 'dumbbell', 'compound', W, 'Low incline, wrists stacked over elbows; stretch at the bottom without bouncing.'],
  ['machine-chest-press', 'Machine Chest Press', 'chest', ['triceps', 'shoulders'], 'machine', 'compound', W, 'Set handles at mid-chest; keep shoulders down and press without locking out hard.'],
  ['smith-incline-press', 'Smith Machine Incline Press', 'chest', ['shoulders', 'triceps'], 'smith', 'compound', W, 'Position the bench so the bar meets the upper chest; control the descent.'],
  ['cable-fly', 'Cable Fly', 'chest', ['shoulders'], 'cable', 'isolation', W, 'Soft bend in the elbows; hug a big tree and squeeze the hands together.'],
  ['dumbbell-fly', 'Dumbbell Fly', 'chest', [], 'dumbbell', 'isolation', W, 'Open wide with a fixed elbow bend until you feel a chest stretch, then sweep back up.'],
  ['pec-deck', 'Pec Deck', 'chest', [], 'machine', 'isolation', W, 'Elbows level with the shoulders; pause briefly with the pads together.'],
  ['push-up', 'Push-Up', 'chest', ['triceps', 'shoulders', 'abs'], 'bodyweight', 'compound', BW, 'Rigid plank from head to heels; chest to an inch off the floor every rep.'],
  ['dip', 'Dip', 'chest', ['triceps', 'shoulders'], 'bodyweight', 'compound', BW, 'Lean slightly forward and lower until the shoulders dip just below the elbows.'],

  // ── Lats ──
  ['pull-up', 'Pull-Up', 'lats', ['biceps', 'upper_back'], 'bodyweight', 'compound', BW, 'Start from a dead hang; drive the elbows down and get the chin over the bar.'],
  ['chin-up', 'Chin-Up', 'lats', ['biceps', 'upper_back'], 'bodyweight', 'compound', BW, 'Palms facing you, shoulder-width; pull the chest toward the bar.'],
  ['lat-pulldown', 'Lat Pulldown', 'lats', ['biceps', 'upper_back'], 'cable', 'compound', W, 'Slight lean back; pull the bar to the upper chest by driving the elbows down.'],
  ['close-grip-lat-pulldown', 'Close-Grip Lat Pulldown', 'lats', ['biceps', 'upper_back'], 'cable', 'compound', W, 'Neutral handle; pull elbows to the ribs and let the lats stretch fully at the top.'],
  ['single-arm-dumbbell-row', 'Single-Arm Dumbbell Row', 'lats', ['upper_back', 'biceps'], 'dumbbell', 'compound', W, 'Brace on a bench; pull the dumbbell toward the hip, not the armpit.'],
  ['straight-arm-pulldown', 'Straight-Arm Pulldown', 'lats', [], 'cable', 'isolation', W, 'Arms nearly straight; sweep the bar down to the thighs using the lats.'],
  ['dumbbell-pullover', 'Dumbbell Pullover', 'lats', ['chest'], 'dumbbell', 'isolation', W, 'Hips low, slight elbow bend; lower behind the head to a stretch and pull back over the chest.'],

  // ── Upper back ──
  ['barbell-row', 'Barbell Row', 'upper_back', ['lats', 'biceps', 'rear_delts', 'lower_back'], 'barbell', 'compound', W, 'Hinge to about 45°, brace hard and row the bar to the lower ribs.'],
  ['seated-cable-row', 'Seated Cable Row', 'upper_back', ['lats', 'biceps', 'rear_delts'], 'cable', 'compound', W, 'Chest tall; pull the handle to the stomach and squeeze the shoulder blades.'],
  ['chest-supported-dumbbell-row', 'Chest-Supported Dumbbell Row', 'upper_back', ['lats', 'rear_delts', 'biceps'], 'dumbbell', 'compound', W, 'Chest on an incline bench; row with elbows at about 45° and pause at the top.'],
  ['t-bar-row', 'Chest-Supported T-Bar Row', 'upper_back', ['lats', 'biceps', 'rear_delts'], 'machine', 'compound', W, 'Keep the chest on the pad and drive the elbows back without jerking.'],
  ['machine-row', 'Machine Row', 'upper_back', ['lats', 'biceps'], 'machine', 'compound', W, 'Set the seat so handles are at mid-chest; pull and squeeze for a one-count.'],
  ['inverted-row', 'Inverted Row', 'upper_back', ['lats', 'biceps', 'rear_delts'], 'bodyweight', 'compound', BW, 'Body straight under a bar; pull the chest to the bar and lower with control.'],

  // ── Traps ──
  ['barbell-shrug', 'Barbell Shrug', 'traps', ['forearms'], 'barbell', 'isolation', W, 'Shrug straight up toward the ears, pause, and lower slowly — no rolling.'],
  ['dumbbell-shrug', 'Dumbbell Shrug', 'traps', ['forearms'], 'dumbbell', 'isolation', W, 'Arms long at your sides; lift the shoulders straight up and hold for a beat.'],
  ['smith-machine-shrug', 'Smith Machine Shrug', 'traps', ['forearms'], 'smith', 'isolation', W, 'Stand tall against the fixed bar path and squeeze the traps at the top.'],

  // ── Shoulders ──
  ['overhead-press', 'Overhead Press', 'shoulders', ['triceps', 'upper_back', 'abs'], 'barbell', 'compound', W, 'Squeeze glutes, bar from collarbone to over mid-foot; move the head through at the top.'],
  ['seated-dumbbell-shoulder-press', 'Seated Dumbbell Shoulder Press', 'shoulders', ['triceps'], 'dumbbell', 'compound', W, 'Back against the pad; lower to ear level and press up without clanking the bells.'],
  ['arnold-press', 'Arnold Press', 'shoulders', ['triceps'], 'dumbbell', 'compound', W, 'Start palms facing you, rotate out as you press; reverse on the way down.'],
  ['machine-shoulder-press', 'Machine Shoulder Press', 'shoulders', ['triceps'], 'machine', 'compound', W, 'Handles start at shoulder height; press smoothly and keep the lower back on the pad.'],
  ['landmine-press', 'Landmine Press', 'shoulders', ['chest', 'triceps'], 'other', 'compound', W, 'Half-kneeling or standing; press the bar up and forward while bracing the core.'],
  ['kettlebell-overhead-press', 'Kettlebell Overhead Press', 'shoulders', ['triceps', 'abs'], 'kettlebell', 'compound', W, 'Bell in the rack, forearm vertical; press to lockout with biceps by the ear.'],
  ['dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', [], 'dumbbell', 'isolation', W, 'Lead with the elbows, raise to shoulder height, lower slower than you lift.'],
  ['cable-lateral-raise', 'Cable Lateral Raise', 'shoulders', [], 'cable', 'isolation', W, 'Cable behind the body, slight lean away; raise out to the side to shoulder height.'],
  ['dumbbell-front-raise', 'Dumbbell Front Raise', 'shoulders', [], 'dumbbell', 'isolation', W, 'Raise to eye level with a soft elbow; no swinging from the hips.'],
  ['ez-bar-upright-row', 'EZ-Bar Upright Row', 'shoulders', ['traps'], 'ez_bar', 'compound', W, 'Shoulder-width grip; pull elbows up and out, stopping at lower-chest height.'],

  // ── Rear delts ──
  ['face-pull', 'Face Pull', 'rear_delts', ['upper_back', 'traps'], 'cable', 'isolation', W, 'Rope at face height; pull toward the eyes and rotate the hands back at the end.'],
  ['rear-delt-fly', 'Dumbbell Rear-Delt Fly', 'rear_delts', ['upper_back'], 'dumbbell', 'isolation', W, 'Hinge forward, arms slightly bent; sweep out wide, leading with the pinkies.'],
  ['reverse-pec-deck', 'Reverse Pec Deck', 'rear_delts', ['upper_back'], 'machine', 'isolation', W, 'Chest on the pad, arms straight-ish; push the handles back in a wide arc.'],
  ['band-pull-apart', 'Band Pull-Apart', 'rear_delts', ['upper_back'], 'band', 'isolation', BW, 'Arms straight at chest height; pull the band apart until it touches the chest.'],

  // ── Biceps ──
  ['barbell-curl', 'Barbell Curl', 'biceps', ['forearms'], 'barbell', 'isolation', W, 'Elbows pinned to your sides; curl without leaning back and lower under control.'],
  ['ez-bar-curl', 'EZ-Bar Curl', 'biceps', ['forearms'], 'ez_bar', 'isolation', W, 'Grip the inner angles; curl to the chest and squeeze before lowering.'],
  ['dumbbell-curl', 'Dumbbell Curl', 'biceps', ['forearms'], 'dumbbell', 'isolation', W, 'Supinate as you curl, keep the elbows still and fully straighten at the bottom.'],
  ['hammer-curl', 'Hammer Curl', 'biceps', ['forearms'], 'dumbbell', 'isolation', W, 'Neutral grip, thumbs up; curl without letting the elbows drift forward.'],
  ['incline-dumbbell-curl', 'Incline Dumbbell Curl', 'biceps', [], 'dumbbell', 'isolation', W, 'Bench at 45°, arms hanging behind the body for a deep biceps stretch.'],
  ['preacher-curl', 'Preacher Curl', 'biceps', [], 'ez_bar', 'isolation', W, 'Armpits snug on the pad; lower to almost straight, never bounce at the bottom.'],
  ['cable-curl', 'Cable Curl', 'biceps', ['forearms'], 'cable', 'isolation', W, 'Step back slightly so the cable pulls at the bottom; elbows stay by the hips.'],

  // ── Triceps ──
  ['triceps-pushdown', 'Triceps Pushdown', 'triceps', [], 'cable', 'isolation', W, 'Elbows tucked and still; push down to full lockout and control the return.'],
  ['overhead-cable-triceps-extension', 'Overhead Cable Triceps Extension', 'triceps', [], 'cable', 'isolation', W, 'Face away from the stack, elbows by the ears; extend fully overhead.'],
  ['skull-crusher', 'EZ-Bar Skull Crusher', 'triceps', [], 'ez_bar', 'isolation', W, 'Lower the bar behind the forehead with elbows pointing up, then extend.'],
  ['overhead-dumbbell-triceps-extension', 'Overhead Dumbbell Triceps Extension', 'triceps', [], 'dumbbell', 'isolation', W, 'Hold one dumbbell with both hands; lower behind the head for a long stretch.'],
  ['close-grip-bench-press', 'Close-Grip Bench Press', 'triceps', ['chest', 'shoulders'], 'barbell', 'compound', W, 'Hands just inside shoulder width, elbows tucked; touch the lower chest.'],
  ['bench-dip', 'Bench Dip', 'triceps', ['chest', 'shoulders'], 'bodyweight', 'compound', BW, 'Hands on a bench behind you; lower until elbows reach 90° and press back up.'],
  ['dumbbell-triceps-kickback', 'Dumbbell Triceps Kickback', 'triceps', [], 'dumbbell', 'isolation', W, 'Upper arm parallel to the floor; straighten the elbow fully and squeeze.'],

  // ── Forearms ──
  ['wrist-curl', 'Barbell Wrist Curl', 'forearms', [], 'barbell', 'isolation', W, 'Forearms on the thighs, palms up; let the bar roll to the fingers then curl it up.'],
  ['reverse-wrist-curl', 'Dumbbell Reverse Wrist Curl', 'forearms', [], 'dumbbell', 'isolation', W, 'Palms down, forearms supported; lift the back of the hand toward you.'],
  ['reverse-curl', 'EZ-Bar Reverse Curl', 'forearms', ['biceps'], 'ez_bar', 'isolation', W, 'Overhand grip; curl with wrists straight and elbows fixed.'],
  ['farmers-carry', "Farmer's Carry", 'forearms', ['traps', 'abs', 'upper_back'], 'dumbbell', 'compound', T, 'Heavy weights at your sides, stand tall and walk with short, quick steps.'],
  ['dead-hang', 'Dead Hang', 'forearms', ['lats'], 'bodyweight', 'isolation', T, 'Hang from the bar with a full grip, shoulders slightly engaged, and breathe.'],

  // ── Abs ──
  ['plank', 'Plank', 'abs', [], 'bodyweight', 'isolation', T, 'Elbows under shoulders, squeeze glutes and pull the ribs down; no sagging hips.'],
  ['side-plank', 'Side Plank', 'abs', [], 'bodyweight', 'isolation', T, 'Elbow under shoulder, hips stacked and lifted in a straight line.'],
  ['cable-crunch', 'Cable Crunch', 'abs', [], 'cable', 'isolation', W, 'Kneel, rope by the ears; curl the ribs toward the hips, not the head to the floor.'],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'abs', ['forearms'], 'bodyweight', 'isolation', BW, 'No swinging; curl the pelvis up and raise the legs to at least hip height.'],
  ['ab-wheel-rollout', 'Ab Wheel Rollout', 'abs', ['lats'], 'other', 'isolation', BW, 'Ribs down, hips tucked; roll out only as far as you can without the back arching.'],
  ['pallof-press', 'Pallof Press', 'abs', [], 'cable', 'isolation', W, 'Stand side-on to the cable and press straight out, resisting the twist.'],
  ['crunch', 'Crunch', 'abs', [], 'bodyweight', 'isolation', BW, 'Lower back stays down; curl the shoulder blades off the floor and exhale hard.'],

  // ── Lower back ──
  ['conventional-deadlift', 'Conventional Deadlift', 'lower_back', ['glutes', 'hamstrings', 'traps', 'forearms', 'quads'], 'barbell', 'compound', W, 'Bar over mid-foot, lats tight, push the floor away and lock out with the glutes.'],
  ['back-extension', 'Back Extension', 'lower_back', ['glutes', 'hamstrings'], 'bodyweight', 'isolation', BW, 'Hinge at the hips over the pad and rise to a straight line — do not hyperextend.'],
  ['reverse-hyperextension', 'Reverse Hyperextension', 'lower_back', ['glutes', 'hamstrings'], 'machine', 'isolation', W, 'Torso on the pad; swing the legs up with the glutes and lower under control.'],

  // ── Glutes ──
  ['hip-thrust', 'Barbell Hip Thrust', 'glutes', ['hamstrings'], 'barbell', 'compound', W, 'Upper back on the bench, chin tucked; drive through the heels to full hip lockout.'],
  ['sumo-deadlift', 'Sumo Deadlift', 'glutes', ['adductors', 'hamstrings', 'quads', 'lower_back'], 'barbell', 'compound', W, 'Wide stance, toes out; spread the floor and keep the chest up off the floor.'],
  ['dumbbell-glute-bridge', 'Dumbbell Glute Bridge', 'glutes', ['hamstrings'], 'dumbbell', 'compound', W, 'Dumbbell on the hips, heels close; squeeze the glutes hard at the top.'],
  ['cable-pull-through', 'Cable Pull-Through', 'glutes', ['hamstrings'], 'cable', 'compound', W, 'Face away from a low cable; hinge back and snap the hips through.'],
  ['kettlebell-swing', 'Kettlebell Swing', 'glutes', ['hamstrings', 'lower_back'], 'kettlebell', 'compound', W, 'Hike the bell back, then snap the hips; arms just guide it to chest height.'],
  ['cable-glute-kickback', 'Cable Glute Kickback', 'glutes', [], 'cable', 'isolation', W, 'Ankle strap on, slight forward lean; kick back without arching the lower back.'],
  ['hip-abduction-machine', 'Hip Abduction Machine', 'glutes', [], 'machine', 'isolation', W, 'Lean slightly forward and push the pads apart; pause at the widest point.'],

  // ── Quads ──
  ['barbell-back-squat', 'Barbell Back Squat', 'quads', ['glutes', 'adductors', 'lower_back'], 'barbell', 'compound', W, 'Brace, sit between the hips to at least parallel, knees track over the toes.'],
  ['front-squat', 'Front Squat', 'quads', ['glutes', 'upper_back', 'abs'], 'barbell', 'compound', W, 'Elbows high, torso upright; sit straight down and drive up chest-first.'],
  ['goblet-squat', 'Goblet Squat', 'quads', ['glutes', 'adductors'], 'dumbbell', 'compound', W, 'Hold the dumbbell at the chest; sit deep between the knees with the torso upright.'],
  ['leg-press', 'Leg Press', 'quads', ['glutes', 'adductors'], 'machine', 'compound', W, 'Lower until the knees reach ~90° without the hips peeling off the pad.'],
  ['hack-squat', 'Hack Squat', 'quads', ['glutes'], 'machine', 'compound', W, 'Feet mid-platform; descend deep under control and drive through the whole foot.'],
  ['smith-machine-squat', 'Smith Machine Squat', 'quads', ['glutes'], 'smith', 'compound', W, 'Feet slightly forward of the bar; squat deep with an upright torso.'],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', ['glutes', 'adductors'], 'dumbbell', 'compound', W, 'Rear foot on a bench; drop the back knee straight down, front heel stays planted.'],
  ['dumbbell-walking-lunge', 'Dumbbell Walking Lunge', 'quads', ['glutes', 'hamstrings'], 'dumbbell', 'compound', W, 'Long steps, back knee kisses the floor; push through the front heel.'],
  ['dumbbell-step-up', 'Dumbbell Step-Up', 'quads', ['glutes'], 'dumbbell', 'compound', W, 'Knee-height box; drive through the top leg without pushing off the back foot.'],
  ['trap-bar-deadlift', 'Trap Bar Deadlift', 'quads', ['glutes', 'hamstrings', 'lower_back', 'traps'], 'other', 'compound', W, 'Stand in the centre, hips a bit lower than a deadlift; push the floor away.'],
  ['leg-extension', 'Leg Extension', 'quads', [], 'machine', 'isolation', W, 'Pad above the ankles; extend fully, pause and lower slowly.'],

  // ── Hamstrings ──
  ['romanian-deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes', 'lower_back'], 'barbell', 'compound', W, 'Soft knees, push the hips back and slide the bar down the thighs to a deep stretch.'],
  ['dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'hamstrings', ['glutes', 'lower_back'], 'dumbbell', 'compound', W, 'Dumbbells close to the legs; hinge until the hamstrings stretch, back flat.'],
  ['good-morning', 'Good Morning', 'hamstrings', ['lower_back', 'glutes'], 'barbell', 'compound', W, 'Bar on the upper back, soft knees; hinge to near parallel with a neutral spine.'],
  ['seated-leg-curl', 'Seated Leg Curl', 'hamstrings', [], 'machine', 'isolation', W, 'Lean forward slightly for a bigger stretch; curl fully and resist on the way up.'],
  ['lying-leg-curl', 'Lying Leg Curl', 'hamstrings', [], 'machine', 'isolation', W, 'Hips pressed into the pad; curl the heels to the glutes without lifting the hips.'],
  ['nordic-hamstring-curl', 'Nordic Hamstring Curl', 'hamstrings', [], 'bodyweight', 'isolation', BW, 'Ankles anchored, hips straight; lower as slowly as you can, push back up with the hands.'],

  // ── Adductors ──
  ['adductor-machine', 'Hip Adduction Machine', 'adductors', [], 'machine', 'isolation', W, 'Start from a comfortable stretch and squeeze the pads together; slow negative.'],
  ['cable-hip-adduction', 'Cable Hip Adduction', 'adductors', [], 'cable', 'isolation', W, 'Ankle strap on the inside leg; sweep it across the body without twisting.'],
  ['copenhagen-plank', 'Copenhagen Plank', 'adductors', ['abs'], 'bodyweight', 'isolation', T, 'Top leg on a bench, hips lifted in line; hold without letting the hips sag.'],

  // ── Calves ──
  ['standing-calf-raise', 'Standing Calf Raise', 'calves', [], 'machine', 'isolation', W, 'Full stretch at the bottom with a one-second pause, then rise onto the big toe.'],
  ['seated-calf-raise', 'Seated Calf Raise', 'calves', [], 'machine', 'isolation', W, 'Pad on the lower thighs; deep stretch, pause, and drive up high.'],
  ['leg-press-calf-raise', 'Leg Press Calf Raise', 'calves', [], 'machine', 'isolation', W, 'Balls of the feet on the platform edge; full range, knees soft but fixed.'],
  ['smith-machine-calf-raise', 'Smith Machine Calf Raise', 'calves', [], 'smith', 'isolation', W, 'Stand on a plate or step under the bar; pause in the stretch every rep.'],
  ['single-leg-dumbbell-calf-raise', 'Single-Leg Dumbbell Calf Raise', 'calves', [], 'dumbbell', 'isolation', W, 'Hold a step for balance; lower the heel fully and rise as high as possible.'],
];

export const EXERCISES: Exercise[] = ROWS.map(([id, name, primaryMuscle, secondaryMuscles, equipment, mechanic, trackingType, cue]) => ({
  id,
  name,
  primaryMuscle,
  secondaryMuscles,
  equipment,
  mechanic,
  trackingType,
  isCustom: false,
  cue,
}));

const BY_ID = new Map<string, Exercise>(EXERCISES.map((e) => [e.id, e]));

/** O(1) built-in lookup. */
export function builtInExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}
