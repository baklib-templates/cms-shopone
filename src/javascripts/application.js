import * as Turbo from "@hotwired/turbo"
import Alpine from "alpinejs"
import collapse from "@alpinejs/collapse"
import { Application } from "@hotwired/stimulus"
import { createIcons, icons } from "lucide"

import MenuController from "../controllers/menu_controller"
import AiSearchCompletionController from "../controllers/ai_search_completion_controller"
import AiAssistantPanelController from "../controllers/ai_assistant_panel_controller"
import AOS from "aos"

window.Alpine = Alpine
Alpine.plugin(collapse)
Alpine.start()

const application = Application.start()
window.Stimulus = application
application.register("menu", MenuController)
application.register("ai-search-completion", AiSearchCompletionController)
application.register("ai-assistant-panel", AiAssistantPanelController)

Turbo.start()

const initLucideIcons = () => {
  createIcons({ icons })
}

document.addEventListener("turbo:load", initLucideIcons)
document.addEventListener("turbo:frame-load", initLucideIcons)

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLucideIcons)
} else {
  initLucideIcons()
}

const AOS_options = { duration: 1200, disableMutationObserver: true }

document.addEventListener("DOMContentLoaded", () => {
  AOS.init(AOS_options)
  const body = document.querySelector("body")
  if (!body) return
  AOS_options.easing = body.getAttribute("data-aos-easing")
  AOS_options.duration = body.getAttribute("data-aos-duration")
  AOS_options.delay = body.getAttribute("data-aos-delay")
})

document.addEventListener("turbo:load", () => {
  const body = document.querySelector("body")
  if (!body) return
  body.setAttribute("data-aos-easing", AOS_options.easing)
  body.setAttribute("data-aos-duration", AOS_options.duration)
  body.setAttribute("data-aos-delay", AOS_options.delay)
  AOS.refreshHard()
})
