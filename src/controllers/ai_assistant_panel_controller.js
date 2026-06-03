import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["panel", "backdrop", "expandBtn", "collapseBtn"]
  static classes = ["expanded"]

  connect() {
    this.isExpanded = false
    this.handleKeydown = this.handleKeydown.bind(this)
  }

  disconnect() {
    this.collapse()
  }

  expand() {
    if (this.isExpanded) return

    this.isExpanded = true
    this.element.classList.add(...this.expandedClasses)
    document.body.classList.add("overflow-hidden")
    document.addEventListener("keydown", this.handleKeydown)
    this.expandBtnTarget.classList.add("hidden")
    this.collapseBtnTarget.classList.remove("hidden")
    this.backdropTarget.setAttribute("aria-hidden", "false")
  }

  collapse() {
    if (!this.isExpanded) return

    this.isExpanded = false
    this.element.classList.remove(...this.expandedClasses)
    document.body.classList.remove("overflow-hidden")
    document.removeEventListener("keydown", this.handleKeydown)
    this.expandBtnTarget.classList.remove("hidden")
    this.collapseBtnTarget.classList.add("hidden")
    this.backdropTarget.setAttribute("aria-hidden", "true")
  }

  handleKeydown(event) {
    if (event.key === "Escape") this.collapse()
  }
}
