from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Inventory_Finance_Management_System_Case_Study.pdf"

PAGE_W, PAGE_H = A4
LEFT = 50
RIGHT = 50
CONTENT_W = PAGE_W - LEFT - RIGHT

NAVY = colors.HexColor("#1D1D35")
OCHRE = colors.HexColor("#C69D35")
BODY = colors.HexColor("#29293F")
MUTED = colors.HexColor("#88889A")
CREAM = colors.HexColor("#F8F6F1")
BORDER = colors.HexColor("#E5E0D7")
SOFT_RULE = colors.HexColor("#D9D3C8")


def register_fonts():
    font_dir = Path("/usr/share/fonts")
    sans = font_dir / "liberation-sans-fonts"
    serif = font_dir / "liberation-serif-fonts"
    pdfmetrics.registerFont(TTFont("CaseSans", str(sans / "LiberationSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("CaseSans-Bold", str(sans / "LiberationSans-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("CaseSerif", str(serif / "LiberationSerif-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("CaseSerif-Bold", str(serif / "LiberationSerif-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("CaseSerif-Italic", str(serif / "LiberationSerif-Italic.ttf")))
    pdfmetrics.registerFont(TTFont("CaseMono", "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Regular.ttf"))


def style(name, font, size, leading, color=BODY, **kwargs):
    return ParagraphStyle(
        name=name,
        fontName=font,
        fontSize=size,
        leading=leading,
        textColor=color,
        alignment=TA_LEFT,
        spaceAfter=0,
        **kwargs,
    )


BODY_STYLE = style("Body", "CaseSerif", 12.1, 18.1)
BODY_ITALIC = style("BodyItalic", "CaseSerif-Italic", 12.1, 18.1, color=BODY)
BODY_SMALL = style("BodySmall", "CaseSerif", 10.7, 15.4)
BODY_SMALL_BOLD = style("BodySmallBold", "CaseSerif-Bold", 10.7, 15.4)
CARD_TITLE = style("CardTitle", "CaseSans-Bold", 11.3, 14.5, color=OCHRE)
CARD_BODY = style("CardBody", "CaseSerif", 10.9, 15.8)
SUBHEAD = style("Subhead", "CaseSans-Bold", 14.2, 17.0, color=NAVY)
FOOTER = style("Footer", "CaseSerif", 10.2, 14.4, color=MUTED)


def draw_para(c, text, x, top, width, para_style):
    para = Paragraph(text, para_style)
    _, height = para.wrap(width, PAGE_H)
    para.drawOn(c, x, top - height)
    return height


def draw_tracking(c, text, x, y, font, size, tracking, color):
    c.saveState()
    c.setFillColor(color)
    c.setFont(font, size)
    t = c.beginText(x, y)
    t.setCharSpace(tracking)
    t.textLine(text)
    c.drawText(t)
    c.restoreState()


def section_header(c, number, title):
    top = PAGE_H - 49
    c.setFillColor(OCHRE)
    c.setFont("CaseSans-Bold", 20)
    c.drawString(LEFT, top - 1, number)
    c.setFillColor(NAVY)
    c.setFont("CaseSans-Bold", 20)
    c.drawString(LEFT + 30, top - 1, title)
    c.setStrokeColor(OCHRE)
    c.setLineWidth(1.35)
    c.line(LEFT, top - 30, PAGE_W - RIGHT, top - 30)
    return top - 61


def callout(c, text, x, top, width):
    para = Paragraph(text, BODY_STYLE)
    _, h = para.wrap(width - 34, PAGE_H)
    height = h + 24
    c.setFillColor(CREAM)
    c.rect(x, top - height, width, height, fill=1, stroke=0)
    c.setFillColor(OCHRE)
    c.rect(x, top - height, 3.2, height, fill=1, stroke=0)
    para.drawOn(c, x + 18, top - 12 - h)
    return height


def card(c, x, top, width, title, text, height=None, body_style=CARD_BODY):
    title_p = Paragraph(title, CARD_TITLE)
    body_p = Paragraph(text, body_style)
    _, title_h = title_p.wrap(width - 28, PAGE_H)
    _, body_h = body_p.wrap(width - 28, PAGE_H)
    actual_height = height or title_h + body_h + 40
    c.setFillColor(CREAM)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.8)
    c.roundRect(x, top - actual_height, width, actual_height, 7, fill=1, stroke=1)
    title_p.drawOn(c, x + 14, top - 17 - title_h)
    body_p.drawOn(c, x + 14, top - 29 - title_h - body_h)
    return actual_height


def check_item(c, text, x, top, width, font_size=10.9, leading=16.2):
    check_style = style(f"Check{top}", "CaseSerif", font_size, leading)
    para = Paragraph(text, check_style)
    _, h = para.wrap(width - 24, PAGE_H)
    c.saveState()
    c.setStrokeColor(OCHRE)
    c.setLineWidth(1.35)
    c.setLineCap(1)
    c.line(x + 2, top - 7, x + 6, top - 11)
    c.line(x + 6, top - 11, x + 14, top + 1)
    c.restoreState()
    para.drawOn(c, x + 21, top - h)
    return h


def draw_architecture_panel(c, top):
    height = 101
    c.setFillColor(NAVY)
    c.roundRect(LEFT, top - height, CONTENT_W, height, 7, fill=1, stroke=0)
    c.setFont("CaseMono", 8.2)
    c.setFillColor(colors.HexColor("#D8D4D2"))
    lines = [
        ("Desktop UI", "HTTP", "API Server", "Prisma", "PostgreSQL"),
        ("Electron + React", "", "Express + Node.js", "", "Supabase / local Podman"),
    ]
    y = top - 31
    c.drawString(LEFT + 15, y, lines[0][0])
    c.setFillColor(OCHRE)
    c.drawString(LEFT + 104, y, "--HTTP-->")
    c.setFillColor(colors.HexColor("#D8D4D2"))
    c.drawString(LEFT + 190, y, lines[0][2])
    c.setFillColor(OCHRE)
    c.drawString(LEFT + 292, y, "--Prisma-->")
    c.setFillColor(colors.HexColor("#D8D4D2"))
    c.drawString(LEFT + 397, y, lines[0][4])
    c.drawString(LEFT + 42, y - 22, lines[1][0])
    c.drawString(LEFT + 190, y - 22, lines[1][2])
    c.drawString(LEFT + 350, y - 22, lines[1][4])
    c.setFillColor(colors.HexColor("#D8D4D2"))
    c.drawString(LEFT + 222, y - 47, "|")
    c.drawString(LEFT + 420, y - 47, "|")
    c.setFillColor(OCHRE)
    c.drawString(LEFT + 253, y - 47, "shared source of truth")
    c.setFillColor(colors.HexColor("#D8D4D2"))
    c.drawString(LEFT + 181, y - 69, "(inventory, finance, ledgers, audit history)")
    return height


def bullet_table(c, rows, top, width=CONTENT_W):
    data = []
    for layer, stack, purpose in rows:
        data.append([
            Paragraph(layer, BODY_SMALL),
            Paragraph(stack, BODY_SMALL),
            Paragraph(purpose, BODY_SMALL),
        ])
    header = [
        Paragraph("<b>LAYER</b>", style("TH1", "CaseSans-Bold", 9.2, 11, colors.white)),
        Paragraph("<b>STACK</b>", style("TH2", "CaseSans-Bold", 9.2, 11, colors.white)),
        Paragraph("<b>PURPOSE</b>", style("TH3", "CaseSans-Bold", 9.2, 11, colors.white)),
    ]
    table = Table([header] + data, colWidths=[88, 179, 228], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
        ("TOPPADDING", (0, 1), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 9),
        ("LINEBELOW", (0, 1), (-1, -1), 0.7, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
    ]))
    _, h = table.wrap(width, PAGE_H)
    table.drawOn(c, LEFT, top - h)
    return h


def page_cover(c):
    draw_tracking(c, "P R O J E C T   C A S E   S T U D Y", LEFT, PAGE_H - 259, "CaseSerif-Bold", 10.5, 0.8, OCHRE)
    c.setFillColor(NAVY)
    c.setFont("CaseSans-Bold", 40)
    c.drawString(LEFT, PAGE_H - 315, "Inventory & Finance")
    c.drawString(LEFT, PAGE_H - 359, "Management System")
    subtitle = (
        "A desktop operations platform built to keep serialized inventory, customer receivables, "
        "vendor payables, and business reporting in one dependable workflow."
    )
    draw_para(c, subtitle, LEFT, PAGE_H - 404, CONTENT_W - 8, BODY_ITALIC)

    rule_y = PAGE_H - 555
    c.setStrokeColor(OCHRE)
    c.setLineWidth(1.15)
    c.line(LEFT, rule_y, PAGE_W - RIGHT, rule_y)
    columns = [
        (LEFT, "SYSTEM", "Desktop full-stack", "application"),
        (LEFT + 139, "SCOPE", "Electron · React ·", "Express · Prisma · PostgreSQL"),
        (LEFT + 330, "STATUS", "Implemented · build", "configured for Windows packaging"),
    ]
    for x, label, line1, line2 in columns:
        draw_tracking(c, label, x, rule_y - 25, "CaseSans", 8.5, 1.1, MUTED)
        c.setFillColor(NAVY)
        c.setFont("CaseSerif-Bold", 11.8)
        c.drawString(x, rule_y - 47, line1)
        c.drawString(x, rule_y - 66, line2)


def page_problem_and_built(c):
    top = section_header(c, "01", "The Problem")
    p1 = (
        "Small businesses managing batteries, rectifier modules, and related equipment need to answer "
        "four questions every day: what is in stock, what has been promised to a customer, what is owed "
        "to vendors, and whether the numbers can be trusted."
    )
    h = draw_para(c, p1, LEFT, top, CONTENT_W, BODY_STYLE)
    p2 = (
        "When inventory, invoicing, purchasing, and payments live in separate spreadsheets or paper ledgers, "
        "serial-level stock status drifts from financial reality. Reservations get missed, invoices are hard "
        "to reconcile, partial receipts are difficult to explain, and useful reporting arrives too late to "
        "guide the next decision."
    )
    h += draw_para(c, p2, LEFT, top - h - 14, CONTENT_W, BODY_STYLE)
    h += callout(
        c,
        "The system was built to make inventory and finance one connected operating record: every unit has a "
        "traceable state, every sale or purchase updates the right ledger, and every high-impact change leaves "
        "an explainable trail.",
        LEFT,
        top - h - 16,
        CONTENT_W,
    )

    top2 = top - h - 52
    c.setFillColor(OCHRE)
    c.setFont("CaseSans-Bold", 20)
    c.drawString(LEFT, top2, "02")
    c.setFillColor(NAVY)
    c.drawString(LEFT + 30, top2, "What Was Built")
    c.setStrokeColor(OCHRE)
    c.setLineWidth(1.35)
    c.line(LEFT, top2 - 30, PAGE_W - RIGHT, top2 - 30)
    lead = (
        "A complete four-part desktop system, with a React interface, protected API, relational data model, "
        "and operational tooling wired together around real inventory and finance workflows."
    )
    lead_h = draw_para(c, lead, LEFT, top2 - 61, CONTENT_W, BODY_STYLE)
    cards_top = top2 - 61 - lead_h - 16
    gap = 18
    card_w = (CONTENT_W - gap) / 2
    card(c, LEFT, cards_top, card_w, "SERIALIZED INVENTORY CONTROL", "Catalog categories, companies, models, specifications, serial numbers, conditions, physical location, repair state, and handover details. Support manual entry, bulk Excel intake, search, filters, and movement history.", height=129)
    card(c, LEFT + card_w + gap, cards_top, card_w, "SALES & RECEIVABLES", "Manage customers, credit limits, invoices, tax, discounts, due dates, payments, statements, aging, and invoice PDFs. Invoice creation reserves the selected units and payments reconcile the customer ledger.", height=129)
    second_top = cards_top - 147
    card(c, LEFT, second_top, card_w, "PROCUREMENT & PAYABLES", "Create purchase orders, receive multiple vendor bills, track partial billing and receipt quantities, record vendor payments, and keep the vendor ledger aligned with what has actually been paid.", height=129)
    card(c, LEFT + card_w + gap, second_top, card_w, "REPORTS & OPERATIONS", "Use the dashboard and report workspace for sales trends, cash flow, customer analysis, stock valuation, turnover, gross margin, and receivables aging, with role-aware settings and user management around it.", height=129)


def page_how_it_works(c):
    top = section_header(c, "03", "How It Works")
    intro = (
        "The system separates the desktop experience, API, data layer, and business operations into clear responsibilities. "
        "The Electron shell starts and monitors the backend, the React client talks to protected Express routes, and Prisma "
        "keeps inventory, finance, and audit records in one PostgreSQL-backed model."
    )
    h = draw_para(c, intro, LEFT, top, CONTENT_W, BODY_STYLE)
    panel_top = top - h - 18
    h_panel = draw_architecture_panel(c, panel_top)
    y = panel_top - h_panel - 25

    for heading, text in [
        (
            "Inventory intake & lifecycle",
            "Items enter through manual forms or validated Excel imports, are attached to a category, company, model, vendor, and purchase order, and receive a unique serial number. Their business status moves from Available to Reserved, Sold, and Delivered while physical status records whether the unit is In Store, In Lab, or in Handover.",
        ),
        (
            "Sales & customer balance",
            "Creating an invoice checks the customer's credit limit, verifies the arithmetic, creates invoice items, reserves the selected inventory, and writes the corresponding customer ledger entry. Customer payments update paid amount and invoice status; voiding a payment reverses those effects instead of deleting history.",
        ),
        (
            "Procurement & vendor balance",
            "A purchase order starts as Draft and moves through Sent, Partial, Paid, and Delivered. Bills are created before receipt, may be split across multiple bills, and cannot exceed the PO total. Vendor payments reduce the vendor ledger, while received quantities are tracked until the order is complete.",
        ),
        (
            "Integrity & visibility",
            "Financial changes run inside serializable transactions with row locks and decimal formatting. Status transitions are validated, cancelled records are excluded from reporting, soft deletes preserve history, and audit tables capture invoice, payment, PO, bill, and inventory-state changes for later review.",
        ),
    ]:
        c.setFillColor(NAVY)
        c.setFont("CaseSans-Bold", 13.4)
        c.drawString(LEFT, y, heading)
        body_h = draw_para(c, text, LEFT, y - 22, CONTENT_W, BODY_SMALL)
        y -= 22 + body_h + 22


def page_features(c):
    top = section_header(c, "04", "Key Features")
    features = [
        "<b>Serialized item records</b> - unique serial numbers, product hierarchy, flexible specifications, condition, purchase and sale values, customer and vendor links.",
        "<b>Lifecycle-aware inventory</b> - Available, Reserved, Sold, Delivered, Under Repair, and Returned states, plus physical location and handover details.",
        "<b>Bulk Excel workflows</b> - template and Samhan formats, file validation, backup before import, rollback support, and manual-review processing.",
        "<b>Invoice controls</b> - Draft, Sent, Partial, Paid, Overdue, and Cancelled states with tax, discounts, due dates, notes, terms, and credit-limit checks.",
        "<b>Payment reconciliation</b> - customer and vendor payments by cash, bank transfer, cheque, UPI, or card, with overpayment protection and reversible voids.",
        "<b>Purchase-to-stock flow</b> - purchase orders, multiple bills, bill limits, partial receipt quantities, vendor payments, and delivery completion checks.",
        "<b>Customer and vendor ledgers</b> - opening balances, current balances, statements, invoice and bill references, and aging views for outstanding amounts.",
        "<b>Decision-ready reporting</b> - dashboard metrics, sales trends, cash summary, customer analysis, stock valuation, inventory turnover, gross margin, and AR aging.",
        "<b>Role-based access</b> - JWT authentication, bcrypt password hashing, permission checks, user management, settings, and protected operational routes.",
        "<b>Built-in business documents</b> - PDF generation for invoices, purchase orders, and vendor bills, plus export-oriented data flows from the desktop app.",
    ]
    y = top
    for feature in features:
        h = check_item(c, feature, LEFT, y, CONTENT_W, font_size=10.8, leading=16.1)
        y -= h + 10


def page_technical(c):
    top = section_header(c, "05", "Technical Approach")
    intro = (
        "For technical readers: the system treats data integrity and operational clarity as first-order requirements. "
        "The desktop packaging, service layer, data model, and reporting surfaces are all shaped around that constraint."
    )
    h = draw_para(c, intro, LEFT, top, CONTENT_W, BODY_STYLE)
    rows = [
        ("Desktop runtime", "Electron 27, Node child process, secure preload", "Windows desktop shell, backend lifecycle, menus, and file dialogs"),
        ("Frontend", "React 18, React Router, Ant Design, Zustand, React Query, Recharts", "Dashboard, forms, tables, filters, workflow pages, and analytics"),
        ("API layer", "Node.js, Express, Axios, Helmet, CORS, rate limiting", "Protected HTTP endpoints, validation, error handling, and module boundaries"),
        ("Data model", "Prisma ORM, PostgreSQL, Supabase or local Podman", "Normalized inventory, sales, purchasing, payment, ledger, and audit records"),
        ("Integrity & security", "Serializable transactions, row locks, DECIMAL(18,4), JWT, bcrypt", "Consistent balances, concurrency safety, authentication, and permissions"),
        ("Exchange & reporting", "ExcelJS / xlsx, Multer, PDFKit, Day.js", "Bulk import, validation, rollback, business PDFs, date handling, and reports"),
    ]
    table_top = top - h - 17
    table_h = bullet_table(c, rows, table_top)

    y = table_top - table_h - 26
    c.setFillColor(NAVY)
    c.setFont("CaseSans-Bold", 13.4)
    c.drawString(LEFT, y, "Design decisions that matter")
    y -= 25
    decisions = [
        "<b>Inventory is tracked at serial level.</b> A unit is not just a quantity in a category; it has a serial number, specifications, provenance, physical state, sales state, and history.",
        "<b>Financial operations are transactional.</b> Customer and vendor balances are ledger-backed, monetary values are normalized to four decimal places, and concurrent changes use locks and retries.",
        "<b>History is preserved by design.</b> Cancellations, payment voids, status transitions, and soft deletes keep the record explainable instead of erasing the event that caused it.",
        "<b>The desktop shell owns the local experience.</b> Electron loads the React build, starts the backend on localhost, exposes only approved preload channels, and shuts the backend down gracefully.",
    ]
    for decision in decisions:
        c.setFillColor(NAVY)
        c.setFont("CaseSans-Bold", 13)
        c.drawString(LEFT + 2, y - 1, "•")
        dh = draw_para(c, decision, LEFT + 18, y, CONTENT_W - 18, BODY_SMALL)
        y -= dh + 9


def page_value(c):
    top = section_header(c, "06", "Value Delivered")
    intro = "This is the difference between disconnected records and a system built around the work:" 
    h = draw_para(c, intro, LEFT, top, CONTENT_W, BODY_STYLE)

    cards_top = top - h - 16
    gap = 14
    card_w = (CONTENT_W - 2 * gap) / 3
    card_h = 94
    value_cards = [
        ("SERIALIZED", "CONTROL", "KNOW WHAT IS IN STOCK"),
        ("CONNECTED", "FINANCE", "KEEP BALANCES CURRENT"),
        ("OPERATIONAL", "CONFIDENCE", "EXPLAIN EVERY CHANGE"),
    ]
    for i, (line1, line2, caption) in enumerate(value_cards):
        x = LEFT + i * (card_w + gap)
        c.setFillColor(NAVY)
        c.roundRect(x, cards_top - card_h, card_w, card_h, 7, fill=1, stroke=0)
        c.setFillColor(OCHRE)
        c.setFont("CaseSans-Bold", 20)
        c.drawCentredString(x + card_w / 2, cards_top - 38, line1)
        c.drawCentredString(x + card_w / 2, cards_top - 62, line2)
        draw_tracking(c, caption, x + 20, cards_top - 78, "CaseSans", 7.2, 0.25, colors.HexColor("#CFCDD3"))

    y = cards_top - card_h - 27
    values = [
        "<b>Faster intake.</b> Manual forms and validated bulk Excel flows reduce repeated entry while preserving the detail needed to find a specific unit later.",
        "<b>Fewer stock mistakes.</b> Reservation, sale, delivery, repair, and handover states make the physical and commercial status of inventory visible together.",
        "<b>Cleaner receivables.</b> Invoice arithmetic, due dates, credit limits, payment reconciliation, void reversals, customer ledgers, and aging make outstanding money easier to manage.",
        "<b>Safer procurement.</b> PO, bill, payment, and receipt rules prevent over-billing, enforce the order of operations, and support partial deliveries without losing the thread.",
        "<b>Better decisions.</b> Dashboard metrics and reports turn the underlying records into cash, sales, customer, valuation, turnover, margin, and aging views.",
        "<b>Team accountability.</b> Permission-aware routes, user management, audit history, soft deletes, and generated business PDFs create a dependable operating record.",
    ]
    for value in values:
        vh = check_item(c, value, LEFT, y, CONTENT_W, font_size=10.8, leading=16.0)
        y -= vh + 9

    footer_y = 91
    c.setStrokeColor(SOFT_RULE)
    c.setLineWidth(0.9)
    c.line(LEFT, footer_y + 20, PAGE_W - RIGHT, footer_y + 20)
    draw_para(
        c,
        "Inventory & Finance Management System - a full-stack desktop platform connecting serialized stock control, customer receivables, vendor payables, and applied business reporting in one operational record.",
        LEFT,
        footer_y + 7,
        CONTENT_W,
        FOOTER,
    )


def build():
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle("Inventory & Finance Management System - Case Study")
    c.setAuthor("Haris Khan")
    page_cover(c)
    c.showPage()
    page_problem_and_built(c)
    c.showPage()
    page_how_it_works(c)
    c.showPage()
    page_features(c)
    c.showPage()
    page_technical(c)
    c.showPage()
    page_value(c)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
