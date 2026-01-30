declare module "react-native-mmkv" {
  export type MMKVOptions = {
    id?: string;
  };

  export class MMKV {
    constructor(options?: MMKVOptions);
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
  }
}
