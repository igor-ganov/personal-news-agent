/**
 * The tests compile the job store against Node types, not the Workers runtime.
 * The store only needs the slice of D1 it declares as its port, so that is
 * what the binding type stands for here.
 */
type D1Database = import("../../src/jobs/sql.js").SqlDatabase;
