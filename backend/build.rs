fn main() {
    // Re-run the build script (and thus recompile macros like `sqlx::migrate!`)
    // if any files in the `migrations` directory change or are added.
    println!("cargo:rerun-if-changed=migrations");
}
