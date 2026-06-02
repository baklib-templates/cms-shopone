import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["messages", "input", "send", "userMessageTemplate", "assistantMessageTemplate", "error"]
  static values = {
    url: String,
    messages: Object,
    autoSubmit: Boolean,
    hiddenClass: String,
    message: String,
  }

  connect() {
    this.abortController = null

    if (this.hasSendTarget) {
      this.sendTarget.addEventListener("click", this._onSendClick)
    }

    if (this.hasInputTarget) {
      this.inputTarget.addEventListener("keydown", this._onInputKeydown)
    }

    if (this.autoSubmitValue && this.messageValue) {
      this.submitMessage(this.messageValue, { addUserBubble: false })
    }
  }

  disconnect() {
    if (this.hasSendTarget) {
      this.sendTarget.removeEventListener("click", this._onSendClick)
    }

    if (this.hasInputTarget) {
      this.inputTarget.removeEventListener("keydown", this._onInputKeydown)
    }

    this._abortInFlight()
  }

  _onSendClick = () => {
    const content = (this.inputTarget?.value || "").trim()
    if (!content) return
    this.submitMessage(content, { addUserBubble: true })
  }

  _onInputKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      this._onSendClick()
    }
  }

  _abortInFlight() {
    try {
      this.abortController?.abort()
    } catch (_) {
      // ignore
    }
    this.abortController = null
  }

  async submitMessage(content, { addUserBubble }) {
    this._hideError()
    this._abortInFlight()

    const messages = this.messagesValue || {}
    const thinkingText = messages.thinking || "AI is thinking..."
    const canceledText = messages.canceled || "Canceled"
    const completedText = messages.completed || "Done."

    if (addUserBubble) {
      this._appendUserMessage(content)
      this.inputTarget.value = ""
    }

    const assistantEl = this._appendAssistantMessage(thinkingText, { muted: true })
    this._setBusy(true)

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    try {
      const res = await fetch(this.urlValue, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message: content }),
        signal,
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => "")
        throw new Error(txt || `HTTP ${res.status}`)
      }

      const data = await this._readResponse(res)
      const answer = (data && (data.content || data.message || data.answer)) || (typeof data === "string" ? data : completedText)
      assistantEl.textContent = String(answer)
      assistantEl.classList.remove("opacity-70")
    } catch (err) {
      if (signal.aborted) {
        assistantEl.textContent = canceledText
        assistantEl.classList.add("opacity-70")
      } else {
        assistantEl.textContent = canceledText
        assistantEl.classList.add("opacity-70")
        this._showError(err?.message || "Request failed")
      }
    } finally {
      this._setBusy(false)
      this._scrollToBottom()
    }
  }

  async _readResponse(res) {
    const contentType = res.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      return await res.json()
    }
    return await res.text()
  }

  _appendUserMessage(content) {
    if (!this.hasUserMessageTemplateTarget || !this.hasMessagesTarget) return
    const node = this.userMessageTemplateTarget.content.cloneNode(true)
    const bubble = node.querySelector(".ai-user-message")
    if (bubble) bubble.textContent = content
    this.messagesTarget.appendChild(node)
    this._scrollToBottom()
  }

  _appendAssistantMessage(content, { muted }) {
    if (!this.hasAssistantMessageTemplateTarget || !this.hasMessagesTarget) return this._fallbackAssistant(content)
    const node = this.assistantMessageTemplateTarget.content.cloneNode(true)
    const bubble = node.querySelector(".ai-assistant-message")
    if (bubble) {
      bubble.textContent = content
      if (muted) bubble.classList.add("opacity-70")
    }
    this.messagesTarget.appendChild(node)
    this._scrollToBottom()
    return bubble || this._fallbackAssistant(content)
  }

  _fallbackAssistant(content) {
    const el = document.createElement("div")
    el.className = "ai-assistant-message rounded-box bg-base-200 px-4 py-2 text-sm text-base-content"
    el.textContent = content
    this.messagesTarget?.appendChild(el)
    return el
  }

  _scrollToBottom() {
    const scroller = this.element.querySelector("[data-ai-search-scroll-container]")
    if (!scroller) return
    scroller.scrollTop = scroller.scrollHeight
  }

  _setBusy(isBusy) {
    if (this.hasSendTarget) this.sendTarget.disabled = isBusy
    if (this.hasInputTarget) this.inputTarget.disabled = isBusy
  }

  _showError(message) {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = message
    this.errorTarget.classList.remove("hidden")
  }

  _hideError() {
    if (!this.hasErrorTarget) return
    this.errorTarget.textContent = ""
    this.errorTarget.classList.add("hidden")
  }
}

