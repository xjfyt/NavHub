mod crud;
mod hot;
mod weather;

pub use crud::{create, delete, update};
pub use hot::hot;
pub use weather::weather;
