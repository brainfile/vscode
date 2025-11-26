import type { LintResult } from "@brainfile/core"
import { type ErrorPageOptions, generateErrorHtml } from "../error"

describe("board/html/error", () => {
	describe("generateErrorHtml", () => {
		const createOptions = (overrides: Partial<ErrorPageOptions> = {}): ErrorPageOptions => ({
			message: "Test error message",
			...overrides,
		})

		it("generates valid HTML document", () => {
			const html = generateErrorHtml(createOptions())

			expect(html).toContain("<!DOCTYPE html>")
			expect(html).toContain('<html lang="en">')
			expect(html).toContain("</html>")
		})

		it("includes error message", () => {
			const html = generateErrorHtml(createOptions({ message: "Failed to parse" }))
			expect(html).toContain("Failed to parse")
		})

		it("escapes HTML in message", () => {
			const html = generateErrorHtml(createOptions({ message: "<script>alert(1)</script>" }))

			expect(html).toContain("&lt;script&gt;")
			expect(html).not.toContain("<script>alert")
		})

		it("includes details when provided", () => {
			const html = generateErrorHtml(
				createOptions({
					message: "Error",
					details: "Some detailed explanation",
				}),
			)

			expect(html).toContain("Some detailed explanation")
			expect(html).toContain('class="error-details"')
		})

		it("omits details section when not provided", () => {
			const html = generateErrorHtml(createOptions({ details: undefined }))
			expect(html).not.toContain('class="error-details"')
		})

		it("escapes HTML in details", () => {
			const html = generateErrorHtml(
				createOptions({
					message: "Error",
					details: "Check <tag> syntax",
				}),
			)

			expect(html).toContain("&lt;tag&gt;")
		})

		it("includes lint issues when provided", () => {
			const lintResult: LintResult = {
				valid: false,
				issues: [
					{ type: "error", message: "Missing colon", line: 5, fixable: false },
					{ type: "warning", message: "Duplicate ID", line: 10, fixable: true },
				],
			}

			const html = generateErrorHtml(createOptions({ lintResult }))

			expect(html).toContain("Issues Found (2)")
			expect(html).toContain("Missing colon")
			expect(html).toContain("(line 5)")
			expect(html).toContain("Duplicate ID")
			expect(html).toContain("[fixable]")
		})

		it("shows error icon for errors", () => {
			const lintResult: LintResult = {
				valid: false,
				issues: [{ type: "error", message: "Error issue", fixable: false }],
			}

			const html = generateErrorHtml(createOptions({ lintResult }))
			expect(html).toContain("❌")
		})

		it("shows warning icon for warnings", () => {
			const lintResult: LintResult = {
				valid: false,
				issues: [{ type: "warning", message: "Warning issue", fixable: false }],
			}

			const html = generateErrorHtml(createOptions({ lintResult }))
			expect(html).toContain("⚠️")
		})

		it("shows Fix Issues button when fixable issues exist", () => {
			const lintResult: LintResult = {
				valid: false,
				issues: [
					{ type: "error", message: "Fixable", fixable: true },
					{ type: "error", message: "Not fixable", fixable: false },
				],
			}

			const html = generateErrorHtml(createOptions({ lintResult }))

			expect(html).toContain("Fix Issues (1)")
			expect(html).toContain('id="fix-issues-btn"')
		})

		it("hides Fix Issues button when no fixable issues", () => {
			const lintResult: LintResult = {
				valid: false,
				issues: [{ type: "error", message: "Not fixable", fixable: false }],
			}

			const html = generateErrorHtml(createOptions({ lintResult }))
			expect(html).not.toContain('id="fix-issues-btn"')
		})

		it("always shows Refresh button", () => {
			const html = generateErrorHtml(createOptions())

			expect(html).toContain("Refresh")
			expect(html).toContain('id="refresh-btn"')
		})

		it("omits issues section when no issues", () => {
			const html = generateErrorHtml(createOptions({ lintResult: undefined }))
			expect(html).not.toContain("Issues Found")
		})

		it("includes JavaScript for button interactions", () => {
			const html = generateErrorHtml(createOptions())

			expect(html).toContain("acquireVsCodeApi")
			expect(html).toContain("postMessage")
			expect(html).toContain("fix-issues")
			expect(html).toContain("refresh")
		})

		it("includes VS Code CSS variables", () => {
			const html = generateErrorHtml(createOptions())

			expect(html).toContain("var(--vscode-foreground)")
			expect(html).toContain("var(--vscode-errorForeground)")
			expect(html).toContain("var(--vscode-button-background)")
		})

		it("escapes issue messages", () => {
			const lintResult: LintResult = {
				valid: false,
				issues: [{ type: "error", message: "<malicious>", fixable: false }],
			}

			const html = generateErrorHtml(createOptions({ lintResult }))
			expect(html).toContain("&lt;malicious&gt;")
		})
	})
})
