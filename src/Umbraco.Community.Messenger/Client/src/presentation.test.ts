import { describe,expect,it } from 'vitest';
import { en,da } from './locales';
describe('Messenger localization',()=>{
 it('translates every English label into Danish',()=>{expect(Object.keys(da.messenger).sort()).toEqual(Object.keys(en.messenger).sort());expect(Object.values(da.messenger).every(x=>x.length>0)).toBe(true);});
});
