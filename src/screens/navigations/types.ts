


export type RootStackParamList = {
  Pin: undefined;
  EntryExit: { userName: string; pin: string };
  AdminPanel: undefined;
  CreateUsers: undefined;
  DeleteUsers: undefined;
  Signature: { userName: string; pin: string; type: 'entrada' | 'salida' | 'desayuno_inicio' | 'desayuno_fin' };
  
};
