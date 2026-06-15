package resumedocx

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
)

// Build reads a Markdown file and writes a DOCX rendition to outputPath.
func Build(inputPath, outputPath string, opts Options) error {
	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return err
	}

	blocks := parseBlocks(string(raw))
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil && filepath.Dir(outputPath) != "." {
		return err
	}

	return writeDocx(outputPath, blocks, opts, inputPath)
}

func writeDocx(outputPath string, blocks []block, opts Options, inputPath string) error {
	f, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer f.Close()

	zw := zip.NewWriter(f)

	title := opts.Title
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath))
	}
	author := opts.Author
	if author == "" {
		author = title
	}
	creator := opts.Creator
	if creator == "" {
		creator = author
	}
	subject := opts.Subject
	if subject == "" {
		subject = "Document"
	}

	if err := writeZipFile(zw, "[Content_Types].xml", contentTypesXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "_rels/.rels", rootRelsXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "docProps/core.xml", corePropsXML(title, author, creator, subject, opts.Tags)); err != nil {
		return err
	}
	if err := writeZipFile(zw, "docProps/app.xml", appPropsXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "word/document.xml", documentXML(blocks)); err != nil {
		return err
	}
	if err := writeZipFile(zw, "word/styles.xml", stylesXML()); err != nil {
		return err
	}
	if err := writeZipFile(zw, "word/_rels/document.xml.rels", documentRelsXML()); err != nil {
		return err
	}

	return zw.Close()
}

func writeZipFile(zw *zip.Writer, name string, data []byte) error {
	w, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}
