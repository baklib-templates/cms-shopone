import { marked } from "marked"
import { Controller } from "@hotwired/stimulus"

marked.setOptions({ renderer: new marked.Renderer() })

marked.use({
  renderer: {
    link({ href, text }) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

export default class extends Controller {
  static targets = [
    "messages",
    "error",
    "input",
    "send",
    "userMessageTemplate",
    "assistantMessageTemplate",
    "retryButton",
  ]
  static classes = ["hidden"]
  static values = {
    url: String,
    timeout: Number,
    autoSubmit: { type: Boolean, default: false },
    message: String,
    messages: Object,
  }

  connect() {
    this.isStreaming = false
    this.chatHistory = []
    this.currentRound = null
    this.renderChatHistoryOnce()
  }

  disconnect() {
    this.stopStreaming()
  }

  inputTargetConnected(element) {
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        this.#sendUserMessage()
      }
    })
  }

  sendTargetConnected(element) {
    element.addEventListener("click", () => this.#sendUserMessage())
  }

  messageValueChanged() {
    if (this.autoSubmitValue && this.messageValue) {
      this.#delayAutoSubmit()
    }
  }

  #delayAutoSubmit() {
    if (this.delayAutoSubmitTimer) {
      clearTimeout(this.delayAutoSubmitTimer)
    }
    this.delayAutoSubmitTimer = setTimeout(() => {
      if (this.messageValue) {
        this.sendMessage(this.messageValue)
      }
    }, 500)
  }

  #sendUserMessage() {
    const message = (this.inputTarget?.value || "").trim()
    if (!message) return
    this.inputTarget.value = ""
    this.sendMessage(message)
  }

  addUserMessage(message) {
    this.currentRound = {
      user: message,
      ai: "",
      status: "streaming",
      retry: null,
    }
    this.chatHistory.push(this.currentRound)
    this.appendUserMessage(message)
    this.appendAssistantMessage("", "streaming", this.chatHistory.length - 1)
  }

  renderChatHistoryOnce() {
    if (!this.hasMessagesTarget) return
    this.messagesTarget.innerHTML = ""
    this.chatHistory.forEach((round, idx) => {
      this.appendUserMessage(round.user)
      this.appendAssistantMessage(round.ai, round.status, idx, round.retry)
    })
    this.scrollToBottom(true)
  }

  appendUserMessage(content) {
    if (!this.hasUserMessageTemplateTarget || !this.hasMessagesTarget) return
    const tpl = this.userMessageTemplateTarget.content.cloneNode(true)
    const bubble = tpl.querySelector(".ai-user-message")
    if (bubble) bubble.textContent = content
    this.messagesTarget.appendChild(tpl)
    this.scrollToBottom(true)
  }

  appendAssistantMessage(content, status, idx, retryFn) {
    if (!this.hasAssistantMessageTemplateTarget || !this.hasMessagesTarget) return
    let forceScroll = true
    const tpl = this.assistantMessageTemplateTarget.content.cloneNode(true)
    const msgSpan = tpl.querySelector(".ai-assistant-message")
    if (!msgSpan) return

    if (status === "error") {
      const button = this.retryButton
      button.dataset.idx = idx
      msgSpan.innerHTML = `<span class="text-error">${this.escapeHTML(content)}</span> ${button.outerHTML}`
      this.#bindRetryButton(idx, retryFn)
    } else if (content) {
      msgSpan.innerHTML = marked(content)
      forceScroll = false
    } else {
      msgSpan.innerHTML = `<span class="opacity-70">${this.thinkingText}</span>`
    }

    this.messagesTarget.appendChild(tpl)
    if (status === "error") this.#bindRetryButton(idx, retryFn)
    this.scrollToBottom(forceScroll)
  }

  updateCurrentAssistantMessage(content, status, idx, retryFn) {
    const msgSpans = this.messagesTarget?.querySelectorAll(".ai-assistant-message")
    const msgSpan = msgSpans?.[msgSpans.length - 1]
    if (!msgSpan) return

    if (status === "error") {
      const button = this.retryButton
      button.dataset.idx = idx
      msgSpan.innerHTML = `<span class="text-error">${this.escapeHTML(content)}</span> ${button.outerHTML}`
      this.#bindRetryButton(idx, retryFn)
    } else if (status === "canceled") {
      msgSpan.innerHTML = `<span class="opacity-70">${this.canceledText}</span>`
    } else if (content) {
      msgSpan.innerHTML = marked(content)
    } else {
      msgSpan.innerHTML = `<span class="opacity-70">${this.thinkingText}</span>`
    }

    this.scrollToBottom()
  }

  sendMessage(message) {
    if (!message || !this.url) return

    if (this.isStreaming) {
      this.updateCurrentAssistantMessage(this.currentRound.ai, "canceled", this.chatHistory.length - 1)
      this.stopStreaming()
    }

    this._hideError()
    this.addUserMessage(message)
    this.isStreaming = true
    this.currentRound.ai = ""
    this.currentRound.status = "streaming"
    const idx = this.chatHistory.length - 1
    this.updateCurrentAssistantMessage("", "streaming", idx)

    const params = new URLSearchParams({ message })
    this.eventSource = new EventSource(`${this.url}?${params.toString()}`)
    this.startTimeoutTimer()

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      data.message ||= ""
      this.resetTimeoutTimer()

      if (data.status === "system") {
        this.currentRound.ai = data.message
        this.currentRound.status = "system"
        this.updateCurrentAssistantMessage(this.currentRound.ai, "system", idx)
      } else if (data.status === "streaming") {
        if (this.currentRound.status !== "streaming") {
          this.currentRound.ai = ""
        }
        this.currentRound.status = "streaming"
        this.currentRound.ai += data.message
        this.updateCurrentAssistantMessage(this.currentRound.ai, "streaming", idx)
      } else if (data.status === "completed") {
        this.currentRound.ai += data.message
        this.currentRound.status = "completed"
        this.isStreaming = false
        this.eventSource.close()
        this.clearTimeoutTimer()
        if (this.completedSuffix) {
          this.currentRound.ai += this.completedSuffix
        }
        this.updateCurrentAssistantMessage(this.currentRound.ai, "completed", idx)
      } else if (data.status === "error") {
        this.currentRound.ai = data.message
        this.currentRound.status = "error"
        this.isStreaming = false
        this.eventSource.close()
        this.clearTimeoutTimer()
        this.currentRound.retry = () => {
          this.currentRound.status = "streaming"
          this.currentRound.ai = ""
          this.appendAssistantMessage("", "streaming", idx)
          this.updateCurrentAssistantMessage("", "streaming", idx)
          this.sendMessage(this.currentRound.user)
        }
        this.updateCurrentAssistantMessage(this.currentRound.ai, "error", idx, this.currentRound.retry)
        this._showError(data.message)
      }
    }

    this.eventSource.onerror = () => {
      this.eventSource.close()
      this.isStreaming = false
      this.currentRound.status = "error"
      this.currentRound.ai = this.networkErrorText
      this.currentRound.retry = () => {
        this.currentRound.status = "streaming"
        this.currentRound.ai = ""
        this.appendAssistantMessage("", "streaming", idx)
        this.updateCurrentAssistantMessage("", "streaming", idx)
        this.sendMessage(this.currentRound.user)
      }
      this.clearTimeoutTimer()
      this.updateCurrentAssistantMessage(this.currentRound.ai, "error", idx, this.currentRound.retry)
      this._showError(this.networkErrorText)
    }
  }

  stopStreaming() {
    if (this.eventSource) {
      try {
        this.eventSource.close()
      } catch (_) {
        // ignore
      }
    }
    this.isStreaming = false
    this.clearTimeoutTimer()
    if (this.hasErrorTarget) {
      this.errorTarget.classList.add(...this.hiddenClasses)
    }
  }

  startTimeoutTimer() {
    if (!this.hasTimeoutValue) return
    this.timeoutTimer = setTimeout(() => {
      if (this.currentRound) {
        this.currentRound.status = "error"
        this.currentRound.ai = this.timeoutErrorText
        const idx = this.chatHistory.length - 1
        this.currentRound.retry = () => {
          this.currentRound.status = "streaming"
          this.currentRound.ai = ""
          this.updateCurrentAssistantMessage("", "streaming", idx)
          this.sendMessage(this.currentRound.user)
        }
        this.updateCurrentAssistantMessage(this.currentRound.ai, "error", idx, this.currentRound.retry)
        this._showError(this.timeoutErrorText)
      }
      if (this.eventSource) this.eventSource.close()
      this.isStreaming = false
    }, this.timeoutValue * 1000)
  }

  clearTimeoutTimer() {
    if (!this.hasTimeoutValue || !this.timeoutTimer) return
    clearTimeout(this.timeoutTimer)
  }

  resetTimeoutTimer() {
    this.clearTimeoutTimer()
    this.startTimeoutTimer()
  }

  scrollToBottom(force = false) {
    const scroller = this.element.querySelector("[data-ai-search-scroll-container]")
    if (!scroller) return
    const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
    if (force || isAtBottom) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }

  escapeHTML(str) {
    if (!str) return ""
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c])
  }

  _showError(message) {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = message
    this.errorTarget.classList.remove(...this.hiddenClasses)
  }

  _hideError() {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = ""
    this.errorTarget.classList.add(...this.hiddenClasses)
  }

  #bindRetryButton(idx, retryFn) {
    if (!retryFn) return
    setTimeout(() => {
      const btns = this.messagesTarget.querySelectorAll(`[data-idx='${idx}']`)
      const btn = btns[btns.length - 1]
      if (btn) btn.onclick = () => retryFn()
    }, 0)
  }

  get url() {
    return this.hasUrlValue ? this.urlValue : null
  }

  get thinkingText() {
    return this.messagesValue?.thinking || "AI is thinking..."
  }

  get canceledText() {
    return this.messagesValue?.canceled || "Canceled"
  }

  get completedSuffix() {
    return this.messagesValue?.completed || ""
  }

  get networkErrorText() {
    return this.messagesValue?.network_error || "Network error, please retry."
  }

  get timeoutErrorText() {
    return this.messagesValue?.timeout_error || "Request timed out, please retry."
  }

  get retryButton() {
    if (this.hasRetryButtonTarget) return this.retryButtonTarget

    const button = document.createElement("button")
    button.type = "button"
    button.className = "inline-flex h-4 w-4 items-center justify-center text-base-content/60"
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z"></path></svg>'
    return button
  }
}
