"use strict";

var Token = require("./token");
var ast = require("./ast");
var VariableExpr = ast.VariableExpr;

function Interpreter() {
  this.globals = new Context(null);

  this.globals.define("print", function(text) {
    console.log(text);
    return text;
  });
}

Interpreter.prototype.interpret = function(program) {
  for (var i = 0; i < program.statements.length; i++) {
    program.statements[i].accept(this, this.globals);
  }
}

Interpreter.prototype.evaluate = function(expression, context) {
  return expression.accept(this, context);
}

Interpreter.prototype.visitBlockStmt = function(node, context) {
  context = new Context(context);

  for (var i = 0; i < node.statements.length; i++) {
    this.evaluate(node.statements[i], context);
  }
}

Interpreter.prototype.visitExpressionStmt = function(node, context) {
  this.evaluate(node.expression, context);
}

Interpreter.prototype.visitClassStmt = function(node, context) {
  // TODO: Evaluate and store superclass.
  var constructor = null;
  var methods = {};
  for (var i = 0; i < node.methods.length; i++) {
    var method = node.methods[i];
    var fn = new VoxFunction(method.parameters, method.body, context);

    if (method.name == node.name) {
      constructor = fn;
    } else {
      methods[method.name] = fn;
    }
  }

  var voxClass = new VoxClass(constructor, methods);
  context.define(node.name, voxClass);
}

Interpreter.prototype.visitFunStmt = function(node, context) {
  var fn = new VoxFunction(node.parameters, node.body, context);
  // TODO: Decide if function should be in scope in its own body.
  context.define(node.name, fn);
}

Interpreter.prototype.visitIfStmt = function(node, context) {
  var condition = this.evaluate(node.condition, context);

  context = new Context(context);
  // TODO: Don't use JS truthiness.
  if (condition) {
    this.evaluate(node.thenBranch, context);
  } else {
    this.evaluate(node.elseBranch, context);
  }
}

Interpreter.prototype.visitVarStmt = function(node, context) {
  var value = this.evaluate(node.initializer, context);
  context.define(node.name, value);
}

Interpreter.prototype.visitWhileStmt = function(node, context) {
  // TODO: Don't use JS truthiness.
  while (this.evaluate(node.condition, context)) {
    this.evaluate(node.body, context);
  }
}

Interpreter.prototype.visitAssignExpr = function(node, context) {
  var value = this.evaluate(node.value, context);

  if (node.target instanceof VariableExpr) {
    context.assign(node.target.name, value);
  } else {
    // node is a PropertyExpr.
    var object = this.evaluate(node.target.object, context);

    if (object instanceof VoxObject) {
      object.fields[node.target.name] = value;
    } else {
      throw new RuntimeError("Cannot add fields to " + object);
    }
  }

  return value;
}

Interpreter.prototype.visitBinaryExpr = function(node, context) {
  var left = this.evaluate(node.left, context);
  var right = this.evaluate(node.right, context);

  // TODO: Don't always use JS semantics.
  switch (node.op) {
    case Token.plus: return left + right;
    case Token.minus: return left - right;
    case Token.star: return left * right;
    case Token.slash: return left / right;
    case Token.percent: return left % right;
    case Token.equalEqual: return left === right;
    case Token.bangEqual: return left !== right;
    case Token.less: return left < right;
    case Token.greater: return left > right;
    case Token.lessEqual: return left <= right;
    case Token.greaterEqual: return left >= right;
  }
}

Interpreter.prototype.visitCallExpr = function(node, context) {
  var fn = this.evaluate(node.fn, context);

  var args = [];
  for (var i = 0; i < node.args.length; i++) {
    args.push(this.evaluate(node.args[i], context));
  }

  // Primitive functions.
  if (fn instanceof Function) return fn.apply(this, args);

  if (fn instanceof VoxFunction) {
    if (args.length != fn.parameters.length) {
      // TODO: Better message!
      throw new RuntimeError("Arity mismatch.");
    }

    context = new Context(fn.closure);

    for (var i = 0; i < args.length; i++) {
      context.define(fn.parameters[i], args[i]);
    }

    return this.evaluate(fn.body, context);
  }

  if (fn instanceof VoxClass) {
    // TODO: Store reference to class.
    var object = new VoxObject();

    if (fn.constructor !== null) {
      var fn = fn.constructor;

      // TODO: Decent amount of copy/paste with above. Clean up.
      if (args.length != fn.parameters.length) {
        // TODO: Better message!
        throw new RuntimeError("Arity mismatch.");
      }

      context = new Context(fn.closure);

      context.define("this", object);

      for (var i = 0; i < args.length; i++) {
        context.define(fn.parameters[i], args[i]);
      }

      this.evaluate(fn.body, context);
    }

    return object;
  }

  throw new RuntimeError(fn.toString() + " cannot be called.");
}

Interpreter.prototype.visitLogicalExpr = function(node, context) {
  var left = this.evaluate(node.left, context);

  // TODO: Don't use JS truthiness.
  if (node.op == Token.and) {
    if (!left) return left;
  } else {
    if (left) return left;
  }

  return this.evaluate(node.right, context);
}

Interpreter.prototype.visitNumberExpr = function(node, context) {
  return node.value;
}

Interpreter.prototype.visitPropertyExpr = function(node, context) {
  var object = this.evaluate(node.object, context);

  // TODO: Decide if we want to wrap all objects.
  if (object instanceof VoxObject) {
    if (object.fields.hasOwnProperty(node.name)) {
      return object.fields[node.name];
    } else {
      // TODO: Look for a method to tear off.
      // TODO: Figure out how to handle unknown properties.
    }
  } else {
    // TODO: Native properties on strings and numbers?
  }

  throw "not impl";
},

Interpreter.prototype.visitStringExpr = function(node, context) {
  return node.value;
}

Interpreter.prototype.visitUnaryExpr = function(node, context) {
  var right = this.evaluate(node.right, context);

  // TODO: Don't always use JS semantics.
  switch (node.op) {
    case Token.plus: return +right;
    case Token.minus: return -right;
    case Token.bang: return !right;
  }
}

Interpreter.prototype.visitVariableExpr = function(node, context) {
  return context.lookUp(node.name);
}

function RuntimeError(message) {
  // TODO: Capture source location to show callstack.
  this.message = message;
}

// TODO: Keep track of its VoxClass.
function VoxObject() {
  this.fields = {};
}

function VoxFunction(parameters, body, closure) {
  VoxObject.call(this);
  this.parameters = parameters;
  this.body = body;
  this.closure = closure;
}

VoxFunction.prototype = Object.create(VoxObject.prototype);

function VoxClass(constructor, methods) {
  VoxObject.call(this);
  this.constructor = constructor;
  this.methods = methods;
}

// TODO: Inherit from VoxFunction?
VoxClass.prototype = Object.create(VoxObject.prototype);


function Context(outer) {
  this.outer = outer;
  this.variables = {};
}

Context.prototype.findDefinition = function(name) {
  var context = this;
  while (context != null) {
    if (context.variables.hasOwnProperty(name)) {
      return context.variables;
    }

    context = context.outer;
  }

  throw new RuntimeError("Variable '" + name + "' is not defined.");
}

Context.prototype.define = function(name, value) {
  // TODO: This does the wrong thing with closures and shadowing:
  //     var a = 1;
  //     {
  //       fun foo() { print(a); }
  //       foo(); // 1.
  //       var a = 2;
  //       foo(); // 2.
  //     }
  if (this.variables.hasOwnProperty(name)) {
    throw new RuntimeError("Variable '" + name + "' is already defined.");
  }

  this.variables[name] = value;
}

Context.prototype.lookUp = function(name) {
  return this.findDefinition(name)[name];
}

Context.prototype.assign = function(name, value) {
  this.findDefinition(name)[name] = value;
}

exports.Interpreter = Interpreter;
exports.RuntimeError = RuntimeError;
