import Promise from 'any-promise';

Promise.reduce = function reduce(fn, start) {
  return function(val) {
    val = Array.isArray(val) ? val : [val]

    const length = val.length;

    if (length === 0) {
      return Promise.resolve(start);
    }

    return val.reduce(function (promise, curr, index, arr) {
      return promise.then(function (prev) {
        if (prev === undefined && length === 1) {
          return curr;
        }

        return fn(prev, curr, index, arr)
      })
    }, Promise.resolve(start))
  }
}

export default Promise
