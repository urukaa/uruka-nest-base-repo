const agent = process.env.npm_config_user_agent || '';

if (!agent.startsWith('pnpm')) {
  const used = agent.split('/')[0] || 'another package manager';

  console.error(`
  This repo uses pnpm, not ${used}.

    corepack enable pnpm
    pnpm install

  If ${used} already created node_modules, remove it first — otherwise the
  layouts mix and the dependency protection is lost:

    rm -rf node_modules && pnpm install

  See the "packageManager" field in package.json.
`);

  process.exit(1);
}
