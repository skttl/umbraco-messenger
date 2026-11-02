import { describe,expect,it } from 'vitest';
import { en,localizations } from './locales';
describe('Messenger localization',()=>{
 it('provides all nine supported backoffice languages',()=>{
   expect(Object.keys(localizations).sort()).toEqual(['da','de','en','es','fr','it','nb','nl','sv']);
 });
 for(const [culture,translation] of Object.entries(localizations)){
   it(`provides every UI label in ${culture}`,()=>{
     expect(Object.keys(translation.messenger).sort()).toEqual(Object.keys(en.messenger).sort());
     for(const value of Object.values(translation.messenger))expect(value.trim().length).toBeGreaterThan(0);
   });
 }
});