declare namespace API {
  type AIResponse = {
    choices: Array<{
      message: { content: string };
    }>;
  }

  type MootRequest = {
    id: number;
    type: number;
    target: number;
    cmd: "trs";
    args: string[];
  }

  type MootResponse = {
    id: number;
    ret: string;
    error: boolean;
    type: number;
  }
}