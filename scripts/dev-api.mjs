import { spawn } from 'node:child_process';
// TypeScript emits decorator metadata required by Nest; esbuild/tsx does not.
let server;
const compiler = spawn(
  'tsc',
  ['-p', 'tsconfig.json', '--watch', '--preserveWatchOutput', '--pretty', 'false'],
  { stdio: ['inherit', 'pipe', 'inherit'] },
);
let output = '';
compiler.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  output += chunk.toString();
  if (/Found 0 errors\. Watching for file changes\./.test(output)) {
    output = '';
    const previous = server;
    const start = () => {
      server = spawn(process.execPath, ['--env-file=../../.env', 'dist/main.js'], {
        stdio: 'inherit',
      });
    };
    if (previous && previous.exitCode === null) {
      previous.once('exit', start);
      previous.kill('SIGTERM');
    } else start();
  }
  if (output.length > 10000) output = output.slice(-1000);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    compiler.kill(signal);
    server?.kill(signal);
    process.exit(0);
  });
compiler.on('exit', (code) => {
  server?.kill();
  process.exit(code ?? 1);
});
