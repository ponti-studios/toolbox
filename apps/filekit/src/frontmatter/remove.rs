use anyhow::Result;
use clap::Parser;
use files::get_files_with_extensions;
use std::fs;
use std::path::PathBuf;

use super::{build_frontmatter_content, parse_frontmatter};

#[derive(Parser)]
pub struct RemoveOpts {
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,
    #[arg(long)]
    pub field: String,
    #[arg(long)]
    pub dry_run: bool,
}

pub fn run(opts: RemoveOpts) -> Result<()> {
    let extensions = vec![".md".to_string(), ".markdown".to_string()];
    let files = get_files_with_extensions(&opts.root, &extensions, false);

    for path in files {
        let content = fs::read_to_string(&path)?;
        let Some(new_content) = remove_field_from_content(&content, &opts.field)? else {
            continue;
        };

        if opts.dry_run {
            println!("Would remove {}: {}", opts.field, path.display());
        } else {
            fs::write(&path, new_content)?;
            println!("Removed {}: {}", opts.field, path.display());
        }
    }

    Ok(())
}

fn remove_field_from_content(content: &str, field: &str) -> Result<Option<String>> {
    let parsed = parse_frontmatter(content)?;
    if !parsed.has_fm {
        return Ok(None);
    }

    let mut frontmatter = parsed.frontmatter.unwrap_or_default();
    if !frontmatter.contains_key(field) {
        return Ok(None);
    }
    frontmatter.remove(field);

    Ok(Some(build_frontmatter_content(&frontmatter, &parsed.body)?))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{parse_frontmatter, remove_field_from_content};
    use super::{run, RemoveOpts};
    use tempfile::tempdir;

    #[test]
    fn removes_requested_field_and_preserves_other_metadata_and_body() {
        let source = "---\ntitle: Example\ndraft: true\nstatus: draft\n---\n\n# Body\n\nKeep this exactly.\n";

        let result = remove_field_from_content(source, "draft")
            .expect("frontmatter should parse")
            .expect("field should be removed");

        assert!(!result.contains("draft:"));
        assert!(result.contains("title: Example"));
        assert!(result.contains("status: draft"));
        let original_body = parse_frontmatter(source)
            .expect("source frontmatter should parse")
            .body;
        let result_body = parse_frontmatter(&result)
            .expect("result frontmatter should parse")
            .body;
        assert_eq!(result_body, original_body);
    }

    #[test]
    fn returns_no_change_when_field_is_missing_or_frontmatter_is_absent() {
        let with_frontmatter = "---\ntitle: Example\n---\n\nBody\n";
        let without_frontmatter = "# Body\n";

        assert!(remove_field_from_content(with_frontmatter, "draft")
            .expect("frontmatter should parse")
            .is_none());
        assert!(remove_field_from_content(without_frontmatter, "draft")
            .expect("body should parse")
            .is_none());
    }

    #[test]
    fn removes_field_from_files_and_leaves_files_without_the_field_unchanged() {
        let temp = tempdir().expect("temporary directory should be created");
        let with_field = temp.path().join("with-field.md");
        let without_field = temp.path().join("without-field.md");
        let body_only = temp.path().join("body-only.md");

        fs::write(
            &with_field,
            "---\ntitle: Example\ndraft: true\nstatus: draft\n---\n\nBody\n",
        )
        .expect("fixture should be written");
        fs::write(&without_field, "---\ntitle: Example\n---\n\nBody\n")
            .expect("fixture should be written");
        fs::write(&body_only, "# Body\n").expect("fixture should be written");

        run(RemoveOpts {
            root: temp.path().to_path_buf(),
            field: "draft".to_string(),
            dry_run: false,
        })
        .expect("remove command should succeed");

        let updated = fs::read_to_string(with_field).expect("updated fixture should be readable");
        assert!(!updated.contains("draft:"));
        assert_eq!(
            fs::read_to_string(&without_field).expect("fixture should be readable"),
            "---\ntitle: Example\n---\n\nBody\n"
        );
        assert_eq!(
            fs::read_to_string(&body_only).expect("fixture should be readable"),
            "# Body\n"
        );
    }
}
