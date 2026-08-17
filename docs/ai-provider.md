# AI provider

Shopport의 AI provider는 [Command Code Provider API](https://commandcode.ai/docs/provider)입니다. 기본 multimodal model은 `gpt-5.4-mini`이며 `COMMAND_CODE_MODEL`로 교체할 수 있습니다.

백엔드는 OpenAI Chat Completions 호환 endpoint `https://api.commandcode.ai/provider/v1/chat/completions`만 호출합니다. Claude model은 Anthropic Messages endpoint가 필요하므로 현재 adapter에서 거부합니다.

모든 요청은 `x-cmd-zdr: 1`을 강제합니다. ZDR-capable upstream이 없는 model은 `422 cmd_zdr_no_providers`로 실패하며 비보존 경로로 fallback하지 않습니다. provider error 본문, prompt, image, API key는 client stream과 application log에 노출하지 않습니다.

필수 production 설정:

```text
COMMAND_CODE_API_KEY=<Secrets Manager에서 주입>
COMMAND_CODE_MODEL=gpt-5.4-mini
COMMAND_CODE_MAX_OUTPUT_TOKENS=512
```

모델은 `searchProducts`, `getProduct` server tool만 사용할 수 있습니다. 도구 호출은 run당 6회, model turn은 4회, 전체 run은 55초로 제한됩니다. 상품 결과는 `neutral-v1` 순서를 유지합니다.
