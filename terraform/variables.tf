variable "cloudflare_account_id" {
  description = "Cloudflare account ID (find in Cloudflare dashboard → Workers & Pages → Account ID)"
  type        = string
}

variable "ai_model" {
  description = "Workers AI model for summarization"
  type        = string
  default     = "@cf/meta/llama-4-scout-17b-16e-instruct"
}

variable "max_content_chars" {
  description = "Max article content characters sent to AI (truncated before prompt)"
  type        = number
  default     = 2000
}
