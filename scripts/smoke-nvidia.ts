import { composeScene } from '../src/server/composeScene.ts';

const apiKey = process.env.NVIDIA_API_KEY?.trim();
if (!apiKey) {
  console.error('NVIDIA_API_KEY is not set');
  process.exit(1);
}

const text = process.argv[2]?.trim() || 'время — деньги';
const result = await composeScene({ text, format: 'landscape' }, { apiKey });

console.log(
  JSON.stringify(
    {
      source: result.source,
      model: result.model ?? null,
      main: result.main,
      background: result.background,
      template: result.template,
    },
    null,
    2,
  ),
);

if (result.main.length === 0) process.exit(1);
