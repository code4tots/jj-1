// jshint esversion: 6

(function(exports) {
"use strict";

if (require.main === module) {
  const fs = require("fs");
  const uriTextPairs = [];
  for (const uri of process.argv.slice(2)) {
    const text = fs.readFileSync(uri).toString();
    uriTextPairs.push([uri, text]);
  }
  console.log(transpileProgram(uriTextPairs));
}


})(module.exports);
