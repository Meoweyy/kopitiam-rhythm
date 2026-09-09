/// The pure measurement core of the Kopitiam Rhythm instrument.
///
/// Everything reachable from this library is headless, deterministic and free of
/// platform behaviour. That is what makes the timing analysis testable against
/// data with known ground truth, and what lets a synthetic 15-session
/// participant run in under a second.
///
/// The app package supplies adapters for the ports declared here — a real clock,
/// a real tap source, a real beat scheduler — plus a fake set that lets the whole
/// game run on a laptop with no tablet attached.
///
/// See `test/architecture/purity_test.dart` for what may never enter this
/// package, and why.
library;

// Exports are added as each milestone lands. They are listed explicitly rather
// than via wildcard barrels, so the public surface of the core stays readable at
// a glance and an accidental export of an internal type is visible in review.
