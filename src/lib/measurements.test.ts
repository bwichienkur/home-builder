import {describe,expect,it} from 'vitest';
import {formatArea,formatLength,parseLength} from './measurements';

describe('measurements',()=>{
 it('formats metric and imperial lengths',()=>{expect(formatLength(2.5,'metric')).toBe('2.50 m');expect(formatLength(2.5,'imperial')).toBe(`8' 2 3/8"`) });
 it('formats area in both unit systems',()=>{expect(formatArea(10,'metric')).toBe('10.0 m²');expect(formatArea(10,'imperial')).toBe('108 ft²')});
 it('parses feet, inches, and fractions',()=>{expect(parseLength(`15' 5 7/8"`,'imperial')).toBeCloseTo(4.721225,6);expect(parseLength('2.50','metric')).toBe(2.5)});
 it('rejects invalid measurements',()=>{expect(parseLength('','metric')).toBeNull();expect(parseLength('nope','imperial')).toBeNull()});
});
