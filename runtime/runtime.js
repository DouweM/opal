/**
  All methods and properties available to ruby/js sources at runtime. These
  are kept in their own namespace to keep the opal namespace clean.
*/
var Rt = Op.runtime = {};

Rt.opal = Op;

/**
  Opal platform - this is overriden in gem context and nodejs context. These
  are the default values used in the browser, `opal-browser'.
*/
var PLATFORM_PLATFORM = "opal";
var PLATFORM_ENGINE   = "opal-browser";
var PLATFORM_VERSION  = "1.9.2";
var PLATFORM_ARGV     = [];

// Minimize js types
var ArrayProto     = Array.prototype,
    ObjectProto    = Object.prototype,

    ArraySlice     = ArrayProto.slice,

    hasOwnProperty = ObjectProto.hasOwnProperty;

/**
  Core runtime classes, objects and literals.
*/
var rb_cBasicObject,  rb_cObject,       rb_cModule,       rb_cClass,
    rb_cNativeObject, rb_mKernel,       rb_cNilClass,     rb_cBoolean,
    rb_cArray,        rb_cNumeric,      rb_cString,       rb_cSymbol,
    rb_cRegexp,       rb_cMatch,        rb_top_self,      Qnil,
    rb_cDir;

/**
  Special objects' prototypes.. saves allocating them each time they
  are needed.
*/
var NativeObjectProto, NilClassProto;

/**
  Core object type flags. Added as local variables, and onto runtime.
*/
var T_CLASS       = 0x0001,
    T_MODULE      = 0x0002,
    T_OBJECT      = 0x0004,
    T_BOOLEAN     = 0x0008,
    T_STRING      = 0x0010,
    T_ARRAY       = 0x0020,
    T_NUMBER      = 0x0040,
    T_PROC        = 0x0080,
    T_SYMBOL      = 0x0100,
    T_HASH        = 0x0200,
    T_RANGE       = 0x0400,
    T_ICLASS      = 0x0800,
    FL_SINGLETON  = 0x1000;

/**
  Define a class

  @param {RubyObject} base
  @param {RClass} super_class
  @param {String} id
  @param {Function} body
*/
Rt.dc = function(base, super_class, id, body) {
  var klass;

  if (base.$flags & T_OBJECT) {
    base = rb_class_real(base.$klass);
  }

  if (super_class === Qnil) {
    super_class = rb_cObject;
  }

  klass = rb_define_class_under(base, id, super_class);

  return body(klass);
};

/**
  Define modules
*/
Rt.md = function(base, id, body) {
  var klass;

  if (base.$flags & T_OBJECT) {
    base = rb_class_real(base.$klass);
  }

  klass = rb_define_module_under(base, id);

  return body(klass);
};

/*
  Shift class
*/
Rt.sc = function(base, body) {
  // native class <<
  // if (!base.$klass || (typeof(base)=="function" && !base.$S)) {
    // base.$k = rb_cNativeClassShift;
    // rb_cNativeClassShift.$k.$a.prototype = base;
    // rb_cNativeClassShift.$a.prototype = base.prototype;
    // base.$f = T_OBJECT;
    // var res = body(base);
    // delete base.$k;
    // delete base.$f;

    // return res;
  // }

  return body(rb_singleton_class(base));
};

/**
  Method missing support.
*/
Rt.mm = function(methods) {
  var tbl = rb_cBasicObject.$m_tbl, method;
  for (var i = 0, ii = methods.length; i < ii; i++) {
    method = methods[i];

    if (!tbl[method]) {
      tbl[method] = rb_method_missing_caller;
    }
  }
};

/**
  Actually calls method missiing.
*/
var rb_method_missing_caller = function(recv, mid) {
  var args = [recv, "method_missing", mid].concat(ArraySlice.call(arguments, 2));

  var tbl = (recv == null ? NilClassProto.$m : recv.$m);

  return tbl.method_missing.apply(null, args);
};

/**
  Helps +respond_to?+ etc know this is a fake method.
*/
rb_method_missing_caller.$mm = true;

/**
  Expose Array.prototype.slice to the runtime. This saves generating
  lots of code each time.
*/
Rt.as = ArraySlice;

/**
  Regexp object. This holds the results of last regexp match.
  X for regeXp.
*/
Rt.X = null;

/**
  Symbol table - all created symbols are stored here, symbol id =>
  symbol literal.
*/
var rb_symbol_tbl = {};

/**
  Symbol creation. Checks the symbol table and creates a new symbol
  if one doesnt exist for the given id, otherwise returns existing
  one.

  @param {String} id symbol id
  @return {Symbol}
*/
var rb_intern = Rt.Y = function(id) {
  var sym = rb_symbol_tbl[id];

  if (!sym) {
    sym = new String(id);
    sym.$k = rb_cSymbol;
    sym.$m = rb_cSymbol.$m_tbl;
    rb_symbol_tbl[id] = sym;
  }

  return sym;
};

/**
  All symbols
*/
Rt.symbols = function() {
  var symbols = [];

  for (var sym in rb_symbol_tbl) {
    if (rb_symbol_tbl.hasOwnProperty(sym)) {
      symbols.push(rb_symbol_tbl[sym]);
    }
  }

  return symbols;
};

/**
  Undefine methods
*/
Rt.um = function(kls) {
  var args = [].slice.call(arguments, 1);

  for (var i = 0, ii = args.length; i < ii; i++) {
    (function(mid) {
      var func = function() {
        rb_raise(rb_eNoMethodError, "undefined method `" + mid + "' for " + this.m$inspect());
      };

      kls.o$a.prototype['m$' + mid] = func;

    })(args[i].m$to_s());
  }

  return Qnil;
};

/**
  Define methods. Public method for defining a method on the given base.

  @param {Object} klass The base to define method on
  @param {String} name Ruby mid
  @param {Function} body The method implementation
  @param {Number} arity Method arity
  @return {Qnil}
*/
var rb_define_method = Rt.dm = function(klass, name, body, arity) {
  if (klass.$flags & T_OBJECT) {
    klass = klass.$klass;
  }

  if (!body.$rbName) {
    body.$rbKlass = klass;
    body.$rbName = name;
    body.$arity = arity;
  }

  rb_define_raw_method(klass, name, body);
  klass.$methods.push(name);

  return Qnil;
};

/**
  Define singleton method.

  @param {Object} base The base to define method on
  @param {String} method_id Method id
  @param {Function} body Method implementation
  @param {Number} arity Method arity
  @return {Qnil}
*/
Rt.ds = function(base, method_id, body, arity) {
  return Rt.dm(rb_singleton_class(base), method_id, body, arity);
};

/**
  Call a super method.

  callee is the function that actually called super(). We use this to find
  the right place in the tree to find the method that actually called super.
  This is actually done in super_find.
*/
Rt.S = function(callee, self, args) {
  var mid = callee.$rbName;
  var func = rb_super_find(self.$klass, callee, mid);

  if (!func) {
    rb_raise(rb_eNoMethodError, "super: no super class method `" + mid + "`" +
      " for " + self.$m.inspect(self, "inspect"));
  }

  // var args_to_send = [self].concat(args);
  var args_to_send = [self, callee.$rbName].concat(args);
  return func.apply(null, args_to_send);
};

/**
  Actually find super impl to call.  Returns null if cannot find it.
*/
function rb_super_find(klass, callee, mid) {
  var cur_method;

  while (klass) {
    if (klass.$method_table[mid]) {
      if (klass.$method_table[mid] == callee) {
        cur_method = klass.$method_table[mid];
        break;
      }
    }
    klass = klass.$super;
  }

  if (!(klass && cur_method)) { return null; }

  klass = klass.$super;

  while (klass) {
    if (klass.$method_table[mid]) {
      return klass.$method_table[mid];
    }

    klass = klass.$super;
  }

  return null;
};

/**
  Exception classes. Some of these are used by runtime so they are here for
  convenience.
*/
var rb_eException,       rb_eStandardError,   rb_eLocalJumpError,  rb_eNameError,
    rb_eNoMethodError,   rb_eArgError,        rb_eScriptError,     rb_eLoadError,
    rb_eRuntimeError,    rb_eTypeError,       rb_eIndexError,      rb_eKeyError,
    rb_eRangeError,      rb_eNotImplementedError;

var rb_eExceptionInstance;

/**
  Standard jump exceptions to save re-creating them everytime they are needed
*/
var rb_eReturnInstance,
    rb_eBreakInstance,
    rb_eNextInstance;

/**
  Ruby break statement with the given value. When no break value is needed, nil
  should be passed here. An undefined/null value is not valid and will cause an
  internal error.

  @param {RubyObject} value The break value.
*/
Rt.B = function(value) {
  rb_eBreakInstance.$value = value;
  rb_raise_exc(rb_eBreakInstance);
};

/**
  Ruby return, with the given value. The func is the reference function which
  represents the method that this statement must return from.
*/
Rt.R = function(value, func) {
  rb_eReturnInstance.$value = value;
  rb_eReturnInstance.$func = func;
  throw rb_eReturnInstance;
};

/**
  Get the given constant name from the given base
*/
Rt.cg = function(base, id) {
  // make sure we dont fail if it turns out our base is null or a js obj
  if (base == null || !base.$flags) {
    base = rb_cObject;
  }

  if (base.$flags & T_OBJECT) {
    base = rb_class_real(base.$klass);
  }
  return rb_const_get(base, id);
};

/**
  Set constant from runtime
*/
Rt.cs = function(base, id, val) {
  if (base.$flags & T_OBJECT) {
    base = rb_class_real(base.$klass);
  }
  return rb_const_set(base, id, val);
};

/**
  Get global by id
*/
Rt.gg = function(id) {
  return rb_gvar_get(id);
};

/**
  Set global by id
*/
Rt.gs = function(id, value) {
  return rb_gvar_set(id, value);
};

/**
  Class variables table
*/
var rb_class_variables = {};

Rt.cvg = function(id) {
  var v = rb_class_variables[id];

  if (v) return v;

  return Qnil;
};

Rt.cvs = function(id, val) {
  return rb_class_variables[id] = val;
};

function rb_regexp_match_getter(id) {
  var matched = Rt.X;

  if (matched) {
    if (matched.$md) {
      return matched.$md;
    } else {
      var res = new cMatch.o$a();
      res.$data = matched;
      matched.$md = res;
      return res;
    }
  } else {
    return Qnil;
  }
}

/**
  An array of procs to call for at_exit()

  @param {Function} proc implementation
*/
var rb_end_procs = Rt.end_procs = [];

/**
  Called upon exit: we need to run all of our registered procs
  in reverse order: i.e. call last ones first.

  FIXME: do we need to try/catch this??
*/
Rt.do_at_exit = function() {
  Op.run(function() {
    var proc;

    while (proc = rb_end_procs.pop()) {
      proc(proc.$S, Qnil);
    }

    return null;
  });
};

