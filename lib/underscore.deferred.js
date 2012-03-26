(function(root){
    'use strict';
    var _ = root._,
        promiseMethods,
        _d,
        flagsCache;

    if (!_.type) {
        _.type = function(obj) {
            return (obj === null || obj === undefined ?
                    String(obj) :
                    Object.prototype.toString.call(obj).slice(8, -1).toLowerCase() || 'object');
        };
    }

    if (!_.args) {
        _.args = function(args) {
            return Array.prototype.slice.call(args);
        };
    }

    // Now start the jQuery-cum-Underscore implementation. Some very
    // minor changes to the jQuery source to get this working.
    promiseMethods = 'done fail isResolved isRejected promise then always pipe'.split(' ');

    // Internal Deferred namespace
    _d = {};

    flagsCache = {};
    // Convert String-formatted flags into Object-formatted ones and store in cache
    function createFlags(flags) {
        var object = flagsCache[flags] = {},
            i, length;
        flags = flags.split(/\s+/);
        _.each(flags, function(value) {
            object[value] = true;
        });
        return object;
    }

    _d.Callbacks = function(flags) {

        // Convert flags from String-formatted to Object-formatted
        // (we check in cache first)
        flags = (flags ?
                 (flagsCache[flags] || createFlags(flags)) :
                 {});

        var // Actual callback list
            list = [],
        // Stack of fire calls for repeatable lists
            stack = [],
        // Last fire value (for non-forgettable lists)
            memory,
        // Flag to know if list is currently firing
            firing,
        // First callback to fire (used internally by add and fireWith)
            firingStart,
        // End of the loop when firing
            firingLength,
        // Index of currently firing callback (modified by remove if needed)
            firingIndex,
        // Add one or several callbacks to the list
            add = function(args) {
                var i,
                    length,
                    elem,
                    type,
                    actual;

                _.each(args, function(elem) {
                    type = _.type(elem);
                    if (type === 'array') {
                        // Inspect recursively
                        add(elem);
                    } else if (type === 'function') {
                        // Add if not in unique mode and callback is not in
                        if (!flags.unique || !self.has(elem)) {
                            list.push(elem);
                        }
                    }
                });
            },
        // Fire callbacks
                    fire = function(context, args) {
                        args = args || [];
                        memory = !flags.memory || [context, args];
                        firing = true;
                        firingIndex = firingStart || 0;
                        firingStart = 0;
                        firingLength = list.length;

                        for (; list && firingIndex < firingLength; firingIndex++) {
                            if (list[firingIndex].apply(context, args) === false &&
                                flags.stopOnFalse) {
                                memory = true; // Mark as halted
                                break;
                            }
                        }

                        firing = false;

                        if (list) {
                            if (!flags.once) {
                                if (stack && stack.length) {
                                    memory = stack.shift();
                                    self.fireWith(memory[0], memory[1]);
                                }
                            } else if (memory === true) {
                                self.disable();
                            } else {
                                list = [];
                            }
                        }
                    },
        // Actual Callbacks object
                    self = {
                        // Add a callback or a collection of callbacks to the list
                        add: function() {
                            if (list) {
                                var length = list.length;
                                add(arguments);
                                // Do we need to add the callbacks to the
                                // current firing batch?
                                if (firing) {
                                    firingLength = list.length;
                                    // With memory, if we're not firing then
                                    // we should call right away, unless previous
                                    // firing was halted (stopOnFalse)
                                } else if (memory && memory !== true) {
                                    firingStart = length;
                                    fire(memory[0], memory[1]);
                                }
                            }
                            return this;
                        },
                        // Remove a callback from the list
                        remove: function() {
                            if (list) {
                                var args = arguments,
                                    argIndex = 0,
                                    argLength = args.length;
                                for (; argIndex < argLength ; argIndex++) {
                                    for (var i = 0; i < list.length; i++) {
                                        if (args[argIndex] === list[i]) {
                                            // Handle firingIndex and firingLength
                                            if (firing) {
                                                if (i <= firingLength) {
                                                    firingLength--;
                                                    if (i <= firingIndex) {
                                                        firingIndex--;
                                                    }
                                                }
                                            }
                                            // Remove the element
                                            list.splice(i--, 1);
                                            // If we have some unicity property then
                                            // we only need to do this once
                                            if (flags.unique) {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            return this;
                        },
                        // Control if a given callback is in the list
                        has: function(fn) {
                            if (list) {
                                var i = 0,
                                    length = list.length;
                                for (; i < length; i++) {
                                    if (fn === list[i]) {
                                        return true;
                                    }
                                }
                            }
                            return false;
                        },
                        // Remove all callbacks from the list
                        empty: function() {
                            list = [];
                            return this;
                        },
                        // Have the list do nothing anymore
                        disable: function() {
                            list = stack = memory = undefined;
                            return this;
                        },
                        // Is it disabled?
                        disabled: function() {
                            return !list;
                        },
                        // Lock the list in its current state
                        lock: function() {
                            stack = undefined;
                            if (!memory || memory === true) {
                                self.disable();
                            }
                            return this;
                        },
                        // Is it locked?
                        locked: function() {
                            return !stack;
                        },
                        // Call all callbacks with the given context and arguments
                        fireWith: function(context, args) {
                            if (stack) {
                                if (firing) {
                                    if (!flags.once) {
                                        stack.push([context, args]);
                                    }
                                } else if (!(flags.once && memory)) {
                                    fire(context, args);
                                }
                            }
                            return this;
                        },
                        // Call all the callbacks with the given arguments
                        fire: function() {
                            self.fireWith(this, arguments);
                            return this;
                        },
                        // To know if the callbacks have already been called at least once
                        fired: function() {
                            return !!memory;
                        }
                    };

        return self;
    };

    _d.Deferred = function(func) {
        var doneList = _d.Callbacks('once memory'),
            failList = _d.Callbacks('once memory'),
            progressList = _d.Callbacks('memory'),
            state = 'pending',
            lists = {
                resolve: doneList,
                reject: failList,
                notify: progressList
            },
            promise = {
                done: doneList.add,
                fail: failList.add,
                progress: progressList.add,

                state: function() {
                    return state;
                },

                // Deprecated
                isResolved: doneList.fired,
                isRejected: failList.fired,

                then: function(doneCallbacks, failCallbacks, progressCallbacks) {
                    deferred.done(doneCallbacks).fail(failCallbacks).progress(progressCallbacks);
                    return this;
                },
                always: function() {
                    deferred.done.apply(deferred, arguments).fail.apply(deferred, arguments);
                    return this;
                },
                pipe: function(fnDone, fnFail, fnProgress) {
                    return _d.Deferred(function(newDefer) {
                        _.each({
                            done: [fnDone, 'resolve'],
                            fail: [fnFail, 'reject'],
                            progress: [fnProgress, 'notify']
                        }, function(data, handler) {
                            var fn = data[0],
                                action = data[1],
                                returned;
                            if (_.type(fn) === 'function') {
                                deferred[handler](function() {
                                    returned = fn.apply(this, arguments);
                                    if (returned && _.type(returned.promise) === 'function') {
                                        returned.promise().then(newDefer.resolve, newDefer.reject, newDefer.notify);
                                    } else {
                                        newDefer[action + 'With'](this === deferred ? newDefer : this, [returned]);
                                    }
                                });
                            } else {
                                deferred[handler](newDefer[action]);
                            }
                        });
                    }).promise();
                },
                // Get a promise for this deferred
                // If obj is provided, the promise aspect is added to the object
                promise: function(obj) {
                    if (!obj) {
                        obj = promise;
                    } else {
                        for (var key in promise) {
                            obj[key] = promise[key];
                        }
                    }
                    return obj;
                }
            },
                                  deferred = promise.promise({}),
                                  key;

        _.each(lists, function(value, key) {
            deferred[key] = value.fire;
            deferred[key + 'With'] = value.fireWith;
        });

        // Handle state
        deferred.done(function() {
            state = 'resolved';
        }, failList.disable, progressList.lock).fail(function() {
            state = 'rejected';
        }, doneList.disable, progressList.lock);

        // Call given func if any
        if (func) {
            func.call(deferred, deferred);
        }

        // All done!
        return deferred;
    };

    // Deferred helper
    _d.when = function(firstParam) {
        var args = _.args(arguments),
            i = 0,
            length = args.length,
            pValues = new Array(length),
            count = length,
            pCount = length,
            deferred = (length <= 1 && firstParam && _.type(firstParam.promise) === 'function' ?
                        firstParam :
                        _d.Deferred()),
            promise = deferred.promise();
        function resolveFunc(i) {
            return function(value) {
                args[i] = arguments.length > 1 ? _.args(arguments) : value;
                if (!(--count)) {
                    deferred.resolveWith(deferred, args);
                }
            };
        }
        function progressFunc(i) {
            return function(value) {
                pValues[i] = arguments.length > 1 ? _.args(arguments) : value;
                deferred.notifyWith(promise, pValues);
            };
        }
        if (length > 1) {
            for (; i < length; i++) {
                if (args[i] && args[i].promise && _.type(args[i].promise) === 'function') {
                    args[i].promise().then(resolveFunc(i), deferred.reject, progressFunc(i));
                } else {
                    --count;
                }
            }
            if (!count) {
                deferred.resolveWith(deferred, args);
            }
        } else if (deferred !== firstParam) {
            deferred.resolveWith(deferred, length ? [firstParam] : []);
        }
        return promise;
    };

    // CommonJS module is defined
    if (_.type(root.exports) !== 'undefined') {
        if (_.type(root.module) !== 'undefined' && root.module.exports) {
            // Export module
            root.module.exports = _d;
        }
        root.exports._d = _d;

    } else if (_.type(root.define) === 'function' && root.define.amd) {
        // Register as a named module with AMD.
        root.define(function() {
            return _d;
        });

        // Integrate with Underscore.js
    } else if (_.type(root._) !== 'undefined') {
        root._.deferred = _d;

        // Or define it
    } else {
        root._ = {
            deferred: _d
        };
    }
})(this);
