'use strict';
// Kept so a Novonode panel that still points at startup-next-fix.cjs keeps working.
// It used to install/build Next.js itself; index.js -> scripts/bootstrap.mjs
// now installs missing dependencies and builds once per start.
process.chdir(__dirname);
require('./index.js');
