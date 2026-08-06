declare namespace API {
  type AIResponse = {
    choices: Array<{
      message: { content: string };
    }>;
  }
}