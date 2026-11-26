import math
import os
import sys
from datetime import date
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".xlsm")
EXCLUDED_NAME_PARTS = ("tidy_sellout", "tidy_sellout_rafraksi", "so_", "soraf_")
IDR_ACCOUNTING_FORMAT = '_- "Rp"* #,##0_-;[Red]_- "Rp"* #,##0_-;_- "Rp" "-"??_-;_-@_-'
THIN_BORDER = Border(*(Side(style="thin") for _ in range(4)))
CENTER_ALIGNMENT = Alignment(horizontal="center")
LEFT_ALIGNMENT = Alignment(horizontal="left")
BOLD_FONT = Font(bold=True)
PERCENTAGE_FILL = PatternFill(
    start_color="E6D9F9", end_color="E6D9F9", fill_type="solid"
)


def safe_value(row, index, default=""):
    return row[index] if len(row) > index else default


def source_files(folder_path, selected_files, output_file=None):
    output_name = Path(output_file).name.lower() if output_file else ""
    return [
        name
        for name in os.listdir(folder_path)
        if name.endswith(SUPPORTED_EXTENSIONS)
        and name.lower() != output_name
        and not name.startswith("~$")
        and not any(part in name.lower() for part in EXCLUDED_NAME_PARTS)
        and (selected_files is None or name in selected_files)
    ]


def add_labels(sheet, memo_number):
    for index, label in enumerate(
        (("Memo", memo_number), ("Supplier", ""), ("Periode", "", "-", ""), ("No. Kontrak", ""))
    ):
        sheet.append(label)
        sheet.cell(row=sheet.max_row, column=1).font = BOLD_FONT
        if index == 2:
            sheet.cell(row=sheet.max_row, column=3).alignment = CENTER_ALIGNMENT
            sheet.cell(row=sheet.max_row, column=4).alignment = LEFT_ALIGNMENT


def format_cell(cell, column, *, currency=False, percentage=False, border=True):
    if border:
        cell.border = THIN_BORDER
    if column in (3, 4, 5, 6, 7):
        cell.alignment = CENTER_ALIGNMENT
    if currency:
        cell.number_format = IDR_ACCOUNTING_FORMAT
    elif percentage:
        cell.number_format = "0%"
        cell.fill = PERCENTAGE_FILL


def format_header(sheet, row, column_count):
    for column in range(1, column_count + 1):
        format_cell(sheet.cell(row=row, column=column), column)
        sheet.cell(row=row, column=column).font = BOLD_FONT


def append_potongan(sheet, dataframe, filename):
    add_labels(sheet, Path(filename).stem[:6])
    sheet.append(["Kode", "Nama", "QTY", "Diskon Satuan", "Total Diskon"])
    format_header(sheet, sheet.max_row, 5)

    total = 0
    for row_index, row in enumerate(dataframe.itertuples(index=False, name=None)):
        if row_index == 0:
            continue
        kode, nama = safe_value(row, 0), safe_value(row, 2)
        qty, diskon_satuan = safe_value(row, 4, 0), safe_value(row, 6, 0)
        try:
            total_diskon = float(qty) * float(diskon_satuan)
            total += total_diskon
        except (TypeError, ValueError):
            total_diskon = ""
        sheet.append([kode, nama, qty, diskon_satuan, total_diskon])
        for column in range(1, 6):
            format_cell(sheet.cell(row=sheet.max_row, column=column), column, currency=column in (4, 5))

    sheet.append(["Total", "", "", "", total])
    total_row = sheet.max_row
    sheet.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=4)
    sheet.cell(row=total_row, column=1).alignment = CENTER_ALIGNMENT
    sheet.cell(row=total_row, column=1).font = BOLD_FONT
    sheet.cell(row=total_row, column=5).font = BOLD_FONT
    for column in range(1, 6):
        format_cell(sheet.cell(row=total_row, column=column), column, currency=column == 5)
    sheet.append([])


def append_rafraksi(sheet, dataframe, filename):
    add_labels(sheet, Path(filename).stem[:6])
    sheet.append(["Kode", "Nama", "QTY", "Harga Satuan", "Jumlah", "Rafraksi"])
    header_row = sheet.max_row
    format_header(sheet, header_row, 6)

    total = 0
    percentages = []
    for row_index, row in enumerate(dataframe.itertuples(index=False, name=None)):
        if row_index == 0:
            continue
        kode, nama = safe_value(row, 0), safe_value(row, 2)
        qty, harga_satuan = safe_value(row, 4, 0), safe_value(row, 5, 0)
        try:
            jumlah = float(qty) * float(harga_satuan)
        except (TypeError, ValueError):
            jumlah = ""

        rafraksi = safe_value(row, 8, 0)
        try:
            rafraksi_value = float(rafraksi)
            total += rafraksi_value
        except (TypeError, ValueError):
            rafraksi_value = rafraksi

        rafraksi_percentage = ""
        if jumlah not in ("", None, 0):
            try:
                rafraksi_percentage = float(rafraksi_value) / float(jumlah)
                if not math.isnan(rafraksi_percentage):
                    percentages.append(rafraksi_percentage)
            except (TypeError, ValueError):
                pass

        sheet.append([kode, nama, qty, harga_satuan, jumlah, rafraksi_value, rafraksi_percentage])
        for column in range(1, 8):
            format_cell(
                sheet.cell(row=sheet.max_row, column=column),
                column,
                currency=column in (4, 5, 6),
                percentage=column == 7,
                border=column != 7,
            )

    if percentages:
        minimum, maximum = min(percentages), max(percentages)
        label = f"Rafraksi {minimum:.0%}" if minimum == maximum else f"Rafraksi {int(minimum * 100)}-{int(maximum * 100)}%"
    else:
        label = "Rafraksi"
    sheet.cell(row=header_row, column=6).value = label

    sheet.append(["Total", "", "", "", "", total, ""])
    total_row = sheet.max_row
    sheet.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=5)
    sheet.cell(row=total_row, column=1).alignment = CENTER_ALIGNMENT
    sheet.cell(row=total_row, column=1).font = BOLD_FONT
    sheet.cell(row=total_row, column=6).font = BOLD_FONT
    for column in range(1, 8):
        format_cell(
            sheet.cell(row=total_row, column=column),
            column,
            currency=column == 6,
            border=column != 7,
        )
    sheet.append([])


def generate_report(mode, folder_path, output_file, selected_files=None):
    rafraksi = mode == "rafraksi"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Tidy Sellout Rafraksi" if rafraksi else "Tidy Sellout"
    append_rows = append_rafraksi if rafraksi else append_potongan
    input_columns = 9 if rafraksi else 7

    files = source_files(folder_path, selected_files, output_file)
    for index, filename in enumerate(files, start=1):
        print(f"Processing {index}/{len(files)}: {filename}", flush=True)
        dataframe = pd.read_excel(
            os.path.join(folder_path, filename), header=None, usecols=range(input_columns)
        ).dropna(how="all")
        append_rows(sheet, dataframe, filename)

    for column in sheet.columns:
        values = (len(str(cell.value)) for cell in column if cell.value)
        sheet.column_dimensions[column[0].column_letter].width = max(values, default=0) + 2
    workbook.save(output_file)
    print(f"Tidy file saved as: {output_file}")


def main(mode=None):
    arguments = sys.argv[1:]
    if mode is None:
        if arguments[:1] == ["--mode"]:
            mode, arguments = arguments[1], arguments[2:]
        else:
            mode = "potongan"
    folder_path = os.path.abspath(arguments[0]) if arguments else os.path.join(r"D:\File SO", "Agustus")
    output_file = arguments[1] if len(arguments) > 1 else os.path.join(
        folder_path, f"{'SOraf' if mode == 'rafraksi' else 'SO'}_{date.today():%Y%m%d}.xlsx"
    )
    selected_files = set(arguments[2:]) if len(arguments) > 2 else None
    generate_report(mode, folder_path, output_file, selected_files)


if __name__ == "__main__":
    main()
