// O motor mudou para src/docx-merge.js: de lá o bundler da Vercel o inclui na
// função serverless, porque api/index.js o requer. Esta ponte mantém válidos os
// comandos e as verificações que já apontavam para cá.
const motor = require('../../src/docx-merge.js');
module.exports = motor;
if (require.main === module) motor.cli(process.argv);
