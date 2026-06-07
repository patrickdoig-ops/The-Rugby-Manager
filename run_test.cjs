const { execSync } = require('child_process');
try {
  execSync('npx tsx scripts/exportPhases.ts', { timeout: 10000, stdio: 'pipe' });
} catch (err) {
  console.log("STDOUT:", err.stdout ? err.stdout.toString() : '');
  console.log("STDERR:", err.stderr ? err.stderr.toString() : '');
  console.log("ERROR:", err.message);
}
