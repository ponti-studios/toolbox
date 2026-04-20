#!/usr/bin/env python3
import pandas as pd
from pathlib import Path
import argparse


def xlsx_to_csv(source_dir=None, file=None, all_sheets=False, keep_formulas=False):
    if file:
        files = [Path(file)]
    elif source_dir:
        files = Path(source_dir).glob("*.xlsx")
    else:
        files = Path(".").glob("*.xlsx")

    for f in files:
        if all_sheets:
            xl = pd.ExcelFile(f)
            for sheet_name in xl.sheet_names:
                sheet_df = pd.read_excel(xl, sheet_name=sheet_name, engine="openpyxl")
                if keep_formulas:
                    for col in sheet_df.columns:
                        sheet_df[col] = sheet_df[col].apply(
                            lambda x: (
                                x
                                if not isinstance(x, str) or not x.startswith("=")
                                else x
                            )
                        )
                safe_name = sheet_name.replace(" ", "_").replace("/", "_")
                csv_path = f.with_stem(f"{f.stem}_{safe_name}")
                sheet_df.to_csv(csv_path, index=False)
                print(f"Converted: {f.name} [{sheet_name}] -> {csv_path.name}")
        else:
            df = pd.read_excel(f, engine="openpyxl")
            if keep_formulas:
                for col in df.columns:
                    df[col] = df[col].apply(
                        lambda x: (
                            x if not isinstance(x, str) or not x.startswith("=") else x
                        )
                    )
            csv_path = f.with_suffix(".csv")
            df.to_csv(csv_path, index=False)
            print(f"Converted: {f.name} -> {csv_path.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert xlsx files to csv")
    parser.add_argument("-d", "--directory", help="Directory containing xlsx files")
    parser.add_argument("-f", "--file", help="Single file to convert")
    parser.add_argument(
        "-a",
        "--all-sheets",
        action="store_true",
        help="Convert all sheets in each file",
    )
    parser.add_argument(
        "--keep-formulas",
        action="store_true",
        help="Preserve formula strings instead of values",
    )
    args = parser.parse_args()

    xlsx_to_csv(
        source_dir=args.directory,
        file=args.file,
        all_sheets=args.all_sheets,
        keep_formulas=args.keep_formulas,
    )
