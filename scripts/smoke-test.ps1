$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
node "$scriptDir\smoke-test.js" $args

