//! Frontmatter command facade.
//!
//! CLI wiring lives here; shared parsing, schema, validation, and migration
//! behavior lives in [`engine`]. Command implementations remain in their
//! focused modules alongside this facade.

use clap::Subcommand;

pub mod aggregate;
pub mod migrate;
pub mod publish;
pub mod slug;
pub mod update;
pub mod validate;
pub mod walk;

mod model;
pub use model::*;

mod engine;
pub use engine::*;

#[derive(Subcommand)]
pub enum FrontmatterCmd {
    Walk(walk::WalkOpts),
    Aggregate(aggregate::AggregateOpts),
    Validate(validate::ValidateOpts),
    Migrate(migrate::MigrateOpts),
    Publish(publish::PublishOpts),
    Slug(slug::SlugOpts),
    Update(update::UpdateOpts),
}

pub fn run(cmd: FrontmatterCmd) -> anyhow::Result<()> {
    use FrontmatterCmd::*;
    match cmd {
        Walk(opts) => walk::run(opts),
        Aggregate(opts) => aggregate::run(opts),
        Validate(opts) => validate::run(opts),
        Migrate(opts) => migrate::run(opts),
        Publish(opts) => publish::run(opts),
        Slug(opts) => slug::run(opts),
        Update(opts) => update::run(opts),
    }
}
