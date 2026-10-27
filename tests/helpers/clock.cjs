// A per-context clock keeps fixtures independent of the machine's date and
// midnight without changing the real application or the host's global Date.
function fixedClock(instant) {
  return class FixtureDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [instant]));
    }
    static now() {
      return instant;
    }
  };
}
module.exports = { fixedClock };
