module.exports = {
  isNull: function(obj) {
    return !obj ||
      typeof obj === 'undefined' ||
      obj === null ||
      /^n\s*u\s*l\s*l$/g.test(('' + obj).trim());
  }
};
