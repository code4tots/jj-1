// jshint esversion: 6

const jj = require("./jj.js");

(function(exports) {
"use strict";

const beforeScript = `
<!DOCTYPE html>
<html>
<head>
<script>
`;

const afterScript = `
</script>
</head>
<body></body>
</html>
`;

if (require.main === module) {
  console.log(
      beforeScript +
      jj.transpileFiles(process.argv.slice(2)) +
      afterScript);
}


})(module.exports);
