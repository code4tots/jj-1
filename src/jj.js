// jshint esversion: 6

(function(exports) {
"use strict";

//// TranspileError/Source/Token
class TranspileError extends Error {
  constructor(message, token) {
    super(message + (token === undefined ? "" : token.getLocationMessage()));
  }
}

function assertEqual(left, right) {
  if (left !== right) {
    throw new TranspileError(
        "assertEqual failed: left = " + left + ", right = " + right, []);
  }
}

class Source {
  constructor(uri, text) {
    this.uri = uri;
    this.text = text;
  }
}

class Token {
  constructor(source, pos, type, val) {
    this.source = source;
    this.pos = pos;
    this.type = type;
    this.val = val;
    this.contextName = null;  // filled in during parsing
    this.contextNameSet = false;
  }
  getLineNumber() {
    let ln = 1;
    const text = this.source.text;
    for (let i = 0; i < this.pos; i++) {
      if (text[i] === "\n") {
        ln++;
      }
    }
    return ln;
  }
  getFunctionName() {
    if (this.contextName === null) {
      throw new TranspileError("No function name for " + this, []);
    }
    return this.contextName;
  }
  setFunctionName(name) {
    if (this.contextNameSet) {
      throw new TranspileError("Function name already set for " + this, []);
    }
    this.contextName = name;
    this.contextNameSet = true;
  }
  getColumnNumber() {
    let cn = 1;
    const text = this.source.text;
    for (let i = this.pos; i > 0 && text[i-1] != "\n"; i--) {
      cn++;
    }
    return cn;
  }
  getLine() {
    let start = this.pos, end = this.pos;
    const text = this.source.text;
    while (start > 0 && text[start-1] != "\n") {
      start--;
    }
    while (end < text.length && text[end] != "\n") {
      end++;
    }
    return text.slice(start, end);
  }
  getLocationMessage() {
    return "\nin " + this.source.uri + ", line " + this.getLineNumber() +
           "\n" + this.getLine() +
           "\n" + " ".repeat(this.getColumnNumber()-1) + "*";
  }
  toString() {
    return "Token(" + this.type + ", " + this.val + ")";
  }
  inspect() {
    return this.toString();
  }
  getTagMessage(context) {
    return context + "@" + this.source.uri + "@" +
           this.getLineNumber();
  }
}

// Lexer

const keywords = [
  "package", "import",
  "class", "def", "async", "await",
  "is", "not", "new",
  "for", "if", "else", "while", "break", "continue", "return",
];
const symbols = [
  "(", ")", "[", "]", "{", "}", ",", ".",
  ";", "#", "$", "=",
  "+", "-", "*", "/", "%", "++", "--",
  "==", "!=", "<", ">", "<=", ">=", "!", "&&", "||",
  "+=", "-=", "*=", "/=", "%=",
].sort().reverse();
const openParen = "(";
const closeParen = ")";
const openBracket = "[";
const closeBracket = "]";
const openBrace = "{";
const closeBrace = "}";

function isKeyword(name) {
  return keywords.indexOf(name) !== -1;
}

function isDigit(ch) {
  return /\d/.test(ch);
}

function isNameChar(ch) {
  return /\w/.test(ch);
}

class Lexer {
  constructor(uri, text) {
    this._source = new Source(uri, text);
    this._text = text;
    this._pos = 0;
    this._peek = this._extract();
  }
  peek() {
    return this._peek;
  }
  next() {
    const token = this._peek;
    this._peek = this._extract();
    return token;
  }
  _ch(dx) {
    const text = this._text;
    const pos = this._pos + (dx || 0);
    return pos < text.length ? text[pos] : "";
  }
  _startsWith(prefix) {
    return this._text.startsWith(prefix, this._pos);
  }
  _skipWhitespaceAndComments() {
    while (this._ch() !== "" &&
           (" \r\n\t".indexOf(this._ch()) !== -1 ||
            this._startsWith("//") ||
            this._startsWith("/*"))) {
      if (this._startsWith("//")) {
        while (this._ch() !== "" && this._ch() !== "\n") {
          this._pos++;
        }
      } else if (this._startsWith("/*")) {
        const start = this._pos;
        this._pos += 2;
        while (this._ch() !== "" && !this._startsWith("*/")) {
          this._pos++;
        }
        if (this._ch() === "") {
          throw new TranspileError(
              "Unterminated multiline comment",
              [new Token(this._source, start, "ERROR")]);
        }
      } else {
        this._pos++;
      }
    }
  }
  _extract() {
    this._skipWhitespaceAndComments();
    if (this._ch() === "") {
      return new Token(this._source, this._pos, "EOF");
    }
    const start = this._pos;
    // STRING
    if (this._startsWith('r"') || this._startsWith('"') ||
        this._startsWith("r'") || this._startsWith("'")) {
      let raw = false;
      if (this._ch() === "r") {
        raw = true;
        this._pos++;
      }
      let quote = this._ch();
      if (this._startsWith(quote.repeat(3))) {
        quote = quote.repeat(3);
      }
      this._pos += quote.length;
      let str = "";
      while (this._ch() !== "" && !this._startsWith(quote)) {
        if (!raw && this._ch() === "\\") {
          this._pos++;
          switch(this._ch()) {
          case "t": str += "\t"; break;
          case "n": str += "\n"; break;
          case "\\": str += "\\"; break;
          case "'": str += "'"; break;
          case '"': str += '"'; break;
          default:
            throw new TranspileError(
                "Unrecognized string escape",
                [new Token(this._source, this._pos, "ERROR")]);
          }
          this._pos++;
        } else {
          str += this._ch();
          this._pos++;
        }
      }
      this._pos += quote.length;
      return new Token(this._source, start, "STRING", str);
    }
    // NUMBER
    let foundDigit = false, foundDot = false;
    while (isDigit(this._ch())) {
      this._pos++;
      foundDigit = true;
    }
    if (this._ch() === ".") {
      this._pos++;
      foundDot = true;
    }
    while (isDigit(this._ch())) {
      this._pos++;
      foundDigit = true;
    }
    if (foundDigit) {
      const val = this._text.slice(start, this._pos);
      if (foundDot) {
        return new Token(this._source, start, "NUMBER", val);
      } else {
        return new Token(this._source, start, "NUMBER", val);
      }
    } else {
      this._pos = start;
    }
    // NAME/KEYWORD
    while (isNameChar(this._ch())) {
      this._pos++;
    }
    if (start !== this._pos) {
      const name = this._text.slice(start, this._pos);
      const type =
          isKeyword(name) ? name :
          "NAME";
      return new Token(
          this._source, start, type, type === name ? undefined : name);
    }
    // SYMBOL
    for (const symbol of symbols) {
      if (this._startsWith(symbol)) {
        this._pos += symbol.length;
        return new Token(this._source, start, symbol);
      }
    }
    // ERROR
    const token = new Token(this._source, start, "ERROR");
    throw new TranspileError("Unrecognized token", token);
  }
}

function lex(uri, text) {
  const lexer = new Lexer(uri, text);
  const tokens = [];
  while (lexer.peek().type !== "EOF") {
    tokens.push(lexer.next());
  }
  tokens.push(lexer.peek());
  return tokens;
}

{
  const tokens = lex("<test>", "aa Bb class 1 2.4 'hi' ++");
  const types = tokens.map(token => token.type).join(",");
  assertEqual("NAME,NAME,class,NUMBER,NUMBER,STRING,++,EOF", types);
  const vals = tokens
      .map(token => token.val).map(val => val === undefined ? "" : val)
      .join(",");
  assertEqual("aa,Bb,,1,2.4,hi,,", vals);
}

//// Parser
class Parser {
  constructor(uri, text) {
    this._tokens = lex(uri, text);
    this._pos = 0;
    this._funcname = null;
  }
  peek(dx) {
    const pos = Math.min(this._pos + (dx || 0), this._tokens.length-1);
    return this._tokens[pos];
  }
  next() {
    const token = this._tokens[this._pos++];
    token.setFunctionName(this._funcname);
    return token;
  }
  at(type, dx) {
    return this.peek(dx).type === type;
  }
  consume(type) {
    if (this.at(type)) {
      return this.next();
    }
  }
  expect(type) {
    if (!this.at(type)) {
      throw new TranspileError(
          "Expected " + type + " but got " + this.peek(), this.peek());
    }
    return this.next();
  }
  parseModule() {
    const token = this.peek();
    const doc = this.at("STRING") ? this.expect("STRING").val : "";
    const pkgs = [];
    while (this.consume("package")) {
      pkgs.push(this.expect("STRING").val);
      this.expect(";");
    }
    if (pkgs.length === 0) {
      pkgs.push(token.source.uri);
    }
    const stmts = [];
    while (!this.at("EOF")) {
      stmts.push(this.parseStatement());
    }
    return {
      "type": "Module",
      "doc": doc,
      "packages": pkgs,
      "token": token,
      "stmts": stmts,
    };
  }
  atFunction() {
    return this.at("async") || this.at("def") ||
           this.at("#") && this.at("def", 1);
  }
  atArrowFunction() {
    const save = this._pos;
    try {
      this.parseArgumentList();
      this.expect("=>");
    } catch (e) {
      return false;
    } finally {
      this._pos = save;
    }
    return this.at("NAME") && this.at("=>", 1);
  }
  parseBlock() {
    const token = this.expect(openBrace);
    const stmts = [];
    while (!this.consume(closeBrace)) {
      stmts.push(this.parseStatement());
    }
    return {
      "type": "Block",
      "token": token,
      "stmts": stmts,
    };
  }
  parseStatement() {
    const token = this.peek();
    if (this.atFunction()) {
      const func = this.parsePrimary();
      if (func.name === null) {
        throw new TranspileError(
            "Function statements must have a name", func.token);
      }
      return {
        "type": "FunctionStatement",
        "token": token,
        "func": func,
      };
    } else if (this.at(openBrace)) {
      return this.parseBlock();
    } else if (this.consume("let")) {
      const name = this.expect("NAME").val;
      let val = null;
      if (this.consume("=")) {
        val = this.parseExpression();
      }
      this.expect(";");
      return {
        "type": "Declaration",
        "token": token,
        "name": name,
        "val": val,
      };
    } else if (this.consume("return")) {
      const expr = this.parseExpression();
      this.expect(";");
      return {
        "type": "Return",
        "token": token,
        "expr": expr,
      };
    } else {
      const expr = this.parseExpression();
      this.expect(";");
      return {
        "type": "ExpressionStatement",
        "token": token,
        "expr": expr,
      };
    }
  }
  parseExpression() {
    return this.parsePostfix();
  }
  parseArgumentList() {
    const token = this.expect(openParen);
    const args = [];
    const optargs = [];
    let vararg = null;
    while (this.at("NAME")) {
      args.push(this.expect("NAME").val);
      if (!this.at("/") && !this.at("*") && !this.at(closeParen)) {
        this.expect(",");
      }
    }
    while (this.consume("/")) {
      optargs.push(this.expect("NAME").val);
      if (!this.at("*") && !this.at(closeParen)) {
        this.expect(",");
      }
    }
    if (this.consume("*")) {
      vararg = this.expect("NAME").val;
    }
    this.expect(closeParen);
    return {
      "type": "ArgumentList",
      "token": token,
      "args": args,
      "optargs": optargs,
      "vararg": vararg,
    };
  }
  parseExpressionList(open, close) {
    const token = this.expect(open);
    const exprs = [];
    let varexpr = null;
    while (!this.consume(close)) {
      if (this.consume("*")) {
        varexpr = this.parseExpression();
        this.expect(close);
        break;
      }
      exprs.push(this.parseExpression());
      if (!this.at(close)) {
        this.expect(",");
      }
    }
    return {
      "type": "ExpressionList",
      "token": token,
      "exprs": exprs,
      "varexpr": varexpr,
    };
  }
  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      const token = this.peek();
      if (this.at(openParen) || this.at("#") && this.at(openParen, 1)) {
        const isNative = !!this.consume("#");
        const exprlist = this.parseExpressionList(openParen, closeParen);
        expr = {
          "type": "FunctionCall",
          "token": token,
          "owner": expr,
          "isNative": isNative,
          "exprlist": exprlist,
        };
      } else if (this.at(openBracket) ||
                 this.at("#") && this.at(closeBracket, 1)) {
        const isNative = !!this.consume("#");
        this.expect(openBracket);
        const key = this.parseExpression();
        this.expect(closeBracket);
        if (this.consume("=")) {
          const val = this.parseExpression();
          expr = {
            "type": "SetItem",
            "token": token,
            "owner": expr,
            "isNative": isNative,
            "key": key,
            "val": val,
          };
        } else {
          expr = {
            "type": "GetItem",
            "token": token,
            "owner": expr,
            "isNative": isNative,
            "key": key,
          };
        }
      } else if (this.at("++") || this.at("--")) {
        const op = this.next().type;
        expr = {
          "type": "PostfixOperator",
          "expr": expr,
          "op": op,
        };
      } else if (this.at("+=") || this.at("-=") || this.at("%=") ||
                 this.at("*=") || this.at("/=")) {
        const op = this.next().type;
        const rhs = this.parseExpression();
        expr = {
          "type": "AugmentAssign",
          "expr": expr,
          "op": op,
          "val": rhs,
        };
      } else if (this.at(".") || this.at("#")) {
        const isNative = !!this.consume("#");
        if (!isNative) {
          this.expect(".");
        }
        const name = this.expect("NAME").val;
        if (this.at(openParen)) {
          const exprlist = this.parseExpressionList(openParen, closeParen);
          expr = {
            "type": "MethodCall",
            "token": token,
            "owner": expr,
            "isNative": isNative,
            "name": name,
            "exprlist": exprlist,
          };
        } else if (this.consume("=")) {
          const rhs = this.parseExpression();
          expr = {
            "type": "SetAttribute",
            "token": token,
            "owner": expr,
            "isNative": isNative,
            "name": name,
            "val": rhs,
          };
        } else {
          expr = {
            "type": "GetAttribute",
            "token": token,
            "owner": expr,
            "isNative": isNative,
            "name": name,
          };
        }
      } else {
        break;
      }
    }
    return expr;
  }
  parsePrimary() {
    const token = this.peek();
    if (this.consume("NUMBER")) {
      return {
        "type": "Number",
        "token": token,
        "val": token.val,
      };
    } else if (this.consume("STRING")) {
      return {
        "type": "String",
        "token": token,
        "val": token.val,
      };
    } else if (this.at(openBracket)) {
      const exprlist = this.parseExpressionList(openBracket, closeBracket);
      return {
        "type": "List",
        "token": token,
        "exprlist": exprlist,
      };
    } else if (this.consume("await")) {
      return {
        "type": "Await",
        "token": token,
        "expr": this.parseExpression(),
      };
    } else if (this.at("NAME") || this.at("#") && this.at("NAME", 1)) {
      const isNative = !!this.consume("#");
      const name = this.expect("NAME").val;
      if (this.consume("=")) {
        const val = this.parseExpression();
        return {
          "type": "SetVariable",
          "token": token,
          "isNative": isNative,
          "name": name,
          "val": val,
        };
      } else {
        return {
          "type": "GetVariable",
          "token": token,
          "isNative": isNative,
          "name": name,
        };
      }
    } else if (this.atFunction() || this.atArrowFunction()) {
      const isArrow = !this.atFunction();
      const isNative = !!this.consume("#");
      const isAsync = !isArrow && !!this.consume("async");
      if (!isArrow) {
        this.expect("def");
      }
      const name = !isArrow && this.at("NAME") ?
                   this.expect("NAME").val : null;
      const arglist = isArrow && this.at("NAME") ?
                      {
                        "type": "ArgumentList",
                        "args": [this.expect("NAME").val],
                        "optargs": [],
                        "vararg": null,
                      } :
                      this.parseArgumentList();
      if (isArrow) {
        this.expect("=>");
      }
      const body = isNative ? this.expect("STRING").val : this.parseBlock();
      return {
        "type": "Function",
        "token": token,
        "isNative": isNative,
        "isAsync": isAsync,
        "name": name,
        "arglist": arglist,
        "isArrow": isArrow,
        "body": body,
      };
    }
    throw new TranspileError(
        "Expected expression but found " + token.toString(), token);
  }
}

function parse(uri, text) {
  return new Parser(uri, text).parseModule();
}

//// CodeGenerator

const attributePrefix = "jj";
const variablePrefix = "jj";

class CodeGenerator {
  constructor() {
    this._contextStack = [];
    this._inverseDebugInfo = Object.create(null);
    this._debugInfo = ["??@??@??"];
  }
  getDebugInfo() {
    return Array.from(this._debugInfo);
  }
  getContextName() {
    return "." + this._contextStack.map(
        node => node.name === null ? "*" : node.name).join(".");
  }
  pushContext(part) {
    this._contextStack.push(part);
  }
  popContext() {
    this._contextStack.pop();
  }
  isInsideAsyncFunction() {
    return this._contextStack.length > 0 &&
           this._contextStack[this._contextStack.length-1].isAsync;
  }
  getDebugMessageFromToken(token) {
    return this.getContextName() + "@" + token.source.uri + "@" +
           token.getLineNumber();
  }
  getDebugIndexFromToken(token) {
    const message = this.getDebugMessageFromToken(token);
    if (this._inverseDebugInfo[message] === undefined) {
      const index = this._debugInfo.length;
      this._inverseDebugInfo[message] = index;
      this._debugInfo.push(message);
    }
    return this._inverseDebugInfo[message];
  }
  translateModule(node) {
    let str = node.stmts.map(stmt => this.translateStatement(stmt))
              .map(stmt => stmt.replace(/\n/g, "\n  "))
              .join("");
    return str;
  }
  translateStatement(node) {
    switch(node.type) {
    case "ExpressionStatement":
      return "\n" + this.translateOuterExpression(node.expr) + ";";
    case "FunctionStatement":
      return "\nconst " + variablePrefix + node.func.name + " = " +
             this.translateInnerExpression(node.func) + ";";
    case "Block": {
      let stmts = node.stmts.map(stmt => this.translateStatement(stmt));
      stmts = stmts.map(stmt => stmt.replace(/\n/g, "\n  "));
      return "\n{" + stmts.join("") + "\n}";
    }
    default:
      throw new TranspileError(
          "Unrecognized statement: " + node.type, node.token);
    }
  }
  translateExpressionList(node, isNative) {
    let exprs = node.exprs.map(expr => this.translateInnerExpression(expr));
    if (!isNative) {
      exprs = ["stack"].concat(exprs);
    }
    if (node.varexpr !== null) {
      exprs.push("..." + this.translateInnerExpression(node.varexpr));
    }
    return exprs.join(",");
  }
  translateArgumentList(node, isNative) {
    let args = node.args.map(arg => variablePrefix + arg);
    args = args.concat(node.optargs.map(arg => variablePrefix + arg));
    if (!isNative) {
      args = ["stack"].concat(args);
    }
    if (node.vararg !== null) {
      args.push("..." + variablePrefix + node.vararg);
    }
    return "(" + args.join(",") + ")";
  }
  translateOuterExpression(node) {
    const index = this.getDebugIndexFromToken(node.token);
    const expr = this.translateInnerExpression(node);
    return "(stack.push(" + index + "),popStack(stack," + expr + "))";
  }
  translateInnerExpression(node) {
    switch(node.type) {
    case "FunctionCall": {
      const owner = this.translateInnerExpression(node.owner);
      const isNative = node.isNative;
      const exprlist = this.translateExpressionList(node.exprlist, isNative);
      return owner + "(" + exprlist + ")";
    }
    case "MethodCall": {
      const owner = this.translateInnerExpression(node.owner);
      const isNative = node.isNative;
      const name = isNative ? node.name : attributePrefix + node.name;
      const exprlist = this.translateExpressionList(node.exprlist, isNative);
      return owner + "." + name + "(" + exprlist + ")";
    }
    case "GetVariable": {
      const isNative = node.isNative;
      return isNative ? node.name : variablePrefix + node.name;
    }
    case "Number":
      return node.val;
    case "String":
      return JSON.stringify(node.val);
    case "List":
      return "[" + this.translateExpressionList(node.exprlist, true) + "]";
    case "Await": {
      if (!this.isInsideAsyncFunction()) {
        throw new TranspileError(
            "Await can only be called from inside an async function",
            node.token);
      }
      return "(yield " + this.translateInnerExpression(node.expr) + ")";
    }
    case "Function": {
      const isNative = node.isNative;
      const isAsync = node.isAsync;
      const name =
          node.name === null ? "" :
          isNative ? node.name : variablePrefix + node.name;
      const arglist = this.translateArgumentList(node.arglist, isNative);
      const isArrow = node.isArrow;
      this.pushContext(node);
      try {
        const body = typeof node.body === "string" ?
            node.body : this.translateStatement(node.body);
        if (isArrow && isAsync) {
          throw new TranspileError(
              "Arrow functions can't be async", node.token);
        }
        if (isNative && isAsync) {
          throw new TranspileError(
              "Native functions can't be async", node.token);
        }
        if (isArrow) {
          return arglist + "=>" + body;
        } else if (isAsync) {
          return "asyncf(function* " + name + arglist + body + ")";
        }
        return "function " + name + arglist + body;
      } finally {
        this.popContext();
      }
      // Should never get here -- this is just here to make linter happy.
      break;
    }
    default:
      throw new TranspileError(
          "Unrecognized expression: " + node.type,
          node.token);
    }
  }
}

const builtinPrelude = `

//// Runtime support

function importUri(stack, uri) {
  if (!moduleCache[uri]) {
    if (!uriTable[uri]) {
      throw new Error("No such module with uri: " + uri);
    }
    const exports = Object.create(null);
    uriTable[uri](stack, exports);
    moduleCache[uri] = exports;
  }
  return moduleCache[uri];
}

function importPackage(stack, pkg) {
  if (!packageTable[pkg]) {
    throw new Error("No such package: " + pkg);
  }
  return importUri(stack, packageTable[pkg]);
}

function displayError(e, stackOrSnapshot, additionalMessage) {
  console.error("***************************");
  console.error("********** ERROR **********");
  console.error("***************************");
  if (additionalMessage) {
    console.error("*** " + additionalMessage + " ***");
  }
  console.error(getStackTraceMessageFromStack(stackOrSnapshot));
  console.error(e);
}

function resolvePromisePool(promisePool) {
  const resolvePromise = promise => promise.then(() => null, error => {
    displayError(error, promise.stackSnapshot, "Promise never awaited on");
  });
  for (const promise of Array.from(promisePool)) {
    resolvePromise(promise);
  }
}

function tryAndCatch(f) {
  const stack = [];
  stack.isAsync = false;
  stack.promisePool = new Set();
  try {
    f(stack);
  } catch (e) {
    displayError(e, stack);
  } finally {
    resolvePromisePool(stack.promisePool);
  }
}

function padstr(str, len) {
  return str.length < len ? str + " ".repeat(len-str.length) : str;
}

function getStackTraceMessageFromStack(stack) {
  let message = "Most recent call last:";
  for (const index of stack) {
    const [context, uri, lineno] = debugInfo[index].split("@");
    message += "\\n  " + padstr(context, 25) +
               padstr("file '" + uri + "'", 20) +
               padstr("line " + lineno, 10);
  }
  message += "\\n--- end of stack trace ---";
  return message;
}

function popStack(stack, value) {
  stack.pop();
  return value;
}

// Behaves significatly different from A+ promises.
const statePending = 0;
const stateResolved = 1;
const stateRejected = 2;
class MockPromise {
  constructor(stack, resolver) {
    // Add this to the promise pool, so that when the promise pool
    // gets cleaned up, we can throw.
    stack.promisePool.add(this);

    this.state = statePending;
    this.callbacksSet = false;
    this.onResolve = null;
    this.onReject = null;
    this.promisePool = stack.promisePool;
    this.result = null;

    // Not sure if I want to copy the entire stack every time
    // I create a new promise.
    // However, I think this will be really useful for situations where
    // I forget to 'await' on promises.
    this.stackSnapshot = Array.from(stack);
    this.stackReference = stack;

    resolver(result => this.resolve(result), err => this.reject(err));
  }
  assertPending() {
    if (this.state !== statePending) {
      throw new Error("Resolve/reject called more than once on this promise");
    }
  }
  then(onResolve, onReject) {
    if (this.callbacksSet) {
      throw new Error("'then' called more than once on this promise");
    }
    this.promisePool.delete(this);
    this.callbacksSet = true;
    this.onResolve = onResolve;
    this.onReject = onReject;
    if (this.state === stateResolved) {
      onResolve(this.result);
    } else if (this.state === stateRejected) {
      onReject(this.result);
    }
  }
  resolve(result) {
    this.assertPending();
    this.state = stateResolved;
    this.result = result;
    if (this.callbacksSet) {
      this.onResolve(result);
    }
  }
  reject(reason) {
    this.assertPending();
    this.state = stateRejected;
    this.result = reason;
    if (this.callbacksSet) {
      this.onReject(reason);
    }
  }
}

function asyncf(generator) {
  return function() {
    const args = [];
    // If you are calling an async function from a synchronous context,
    // we should start a new context.
    // Also include the last frame of synchronous context to document
    // where this asynchronous instance came from.
    const stack = arguments[0];
    const startNewContext = !stack.isAsync;
    const newStack = startNewContext ? [stack[stack.length-1]] : stack;
    if (startNewContext) {
      newStack.isAsync = true;
      newStack.promisePool = new Set();
      args.push(newStack);
    } else {
      args.push(arguments[0]);
    }
    for (let i = 1; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    const generatorObject = generator.apply(this, args);
    const promise = new MockPromise(newStack, (resolve, reject) => {
      asyncfHelper(generatorObject, resolve, reject);
    });
    if (startNewContext) {
      promise.then(result => {
        resolvePromisePool(newStack.promisePool);
      }, e => {
        // startNextContext promise is always considered to have been
        // 'awaited' upon. As such, we use stackReference here instead of
        // stackSnapshot which is only reserved for promises that were
        // never awaited on.
        displayError(e, promise.stackReference);
        resolvePromisePool(newStack.promisePool);
      });
    }
    return promise;
  }
}

function asyncfHelper(generatorObject, resolve, reject, val, thr) {
  try {
    let value, done;
    if (thr) {
      ({value, done} = generatorObject.throw(val));
    } else {
      ({value, done} = generatorObject.next(val));
    }
    if (done) {
      resolve(value);
      return;
    } else {
      value.then(result => {
        asyncfHelper(generatorObject, resolve, reject, result);
      }, e => {
        asyncfHelper(generatorObject, resolve, reject, e, true);
      });
    }
  } catch (e) {
    reject(e);
  }
}

//// Builtins

function jjlen(stack, xs) {
  if (Array.isArray(xs)) {
    return xs.length;
  }
}

`;

function transpile(uriTextPairs) {
  const packageTable = Object.create(null);  // package-name => uri
  const uriTable = Object.create(null);  // uri => code
  const startUri = uriTextPairs[uriTextPairs.length-1][0];
  function addPackage(pkg, uri) {
    if (packageTable[pkg]) {
      throw new TranspileError(
          "Duplicate package: " + pkg +
          " (from " + packageTable.get(pkg) + " and " + uri + ")");
    }
    packageTable[pkg] = uri;
  }
  function addUri(uri, code) {
    if (uriTable[uri]) {
      throw new TranspileError("Duplicate uri: " + uri);
    }
    uriTable[uri] = code;
  }
  let uriTableStr = "";
  let packageTableStr = "";
  const cg = new CodeGenerator();
  for (const [uri, text] of uriTextPairs) {
    let code = null;
    if (uri.endsWith(".js")) {
      code = "\n" + text;
      const pkgs = [];
      const re = /^\/\/ jj package: ([a-zA-Z0-9_.]+)$/;
      let result = null;
      while ((result = re.exec(code)) !== null) {
        pkgs.push(result[1]);
      }
      addUri(uri, code);
      for (const pkg of pkgs) {
        addPackage(pkg, uri);
        packageTableStr += "\npackageTable[" + JSON.stringify(pkg) +
                           "] = " + JSON.stringify(uri) + ";";
      }
    } else {
      const mod = parse(uri, text);
      code = cg.translateModule(mod);
      addUri(uri, code);
      for (const pkg of mod.packages) {
        addPackage(pkg, uri);
      }
    }
    uriTableStr += "\nuriTable[" + JSON.stringify(uri) + "] = " +
                   "function(stack, uri) {" + code + "\n};";
  }
  return "// Autogenerated from jj->javascript transpiler" +
         "\n// jshint esversion: 6" +
         "\n(function() {" +
         "\n\"use strict\";" +
         builtinPrelude +
         "\nconst moduleCache = Object.create(null);" +
         "\nconst debugInfo = " + JSON.stringify(cg.getDebugInfo()) + ";" +
         "\nconst packageTable = Object.create(null);" + packageTableStr +
         "\nconst uriTable = Object.create(null);" + uriTableStr +
         "\ntryAndCatch(stack => importUri(stack, " +
             JSON.stringify(startUri) + "));" +
         "\n})();";
}

if (require.main === module) {
  const fs = require("fs");
  const uriTextPairs = [];
  for (const uri of process.argv.slice(2)) {
    const text = fs.readFileSync(uri).toString();
    uriTextPairs.push([uri, text]);
  }
  console.log(transpile(uriTextPairs));
}

})(module.exports);
