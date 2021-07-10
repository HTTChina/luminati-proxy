// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
require('./config.js');
const _ = require('lodash');
const E = exports;

E.find_matches = (all_rules, selector)=>
    (all_rules||[]).filter(x=>E.matches_rule(x.match, selector));

E.select_rules = (all_rules, selector, overrides=[])=>{
    let matches = E.find_matches(all_rules, selector);
    return _.merge({}, ...matches.map(x=>x.rules), ...overrides,
        E.rule_merge_customizer);
};

E.matches_rule = (match, selector)=>{
    for (let k in match)
    {
        let preprocessor;
        if (k=='hostname')
            preprocessor = unify_hostnames;
        if (k=='version_min')
        {
            if ((match[k]||0)>(selector.version||0))
                return false;
        }
        else if (k=='per')
        {
            if (match[k]/100<Math.random())
                return false;
        }
        else if (!E.rule_value_match(match[k], selector[k], preprocessor))
            return false;
    }
    return true;
};

E.rule_value_match = (rule_v, v, preprocessor)=>{
    if (Array.isArray(rule_v))
    {
        return rule_v.some(_rule_v=>E.rule_value_match(_rule_v, v,
            preprocessor));
    }
    if (!_.isObject(rule_v))
    {
        if (typeof v!='string')
            return rule_v==v;
        if (preprocessor)
            [rule_v, v] = preprocessor(rule_v, v);
        if (rule_v.length!=v.length)
            return false;
        for (let i=0; i<v.length; i++)
        {
            if (rule_v[i].toLowerCase() !== v[i].toLowerCase())
                return false;
        }
        return true;
    }
    if (rule_v.test)
    {
        // XXX vladislavp: move this logic (insensitive case for regex) in
        // method for rules config update
        return new RegExp(rule_v, rule_v.flags.replace('i', '')+'i')
            .test(v||'');
    }
    return _.every(rule_v,
        (_rule_v, k)=>E.rule_value_match(_rule_v, v && v[k], preprocessor));
};

E.rule_merge_customizer = (dest, src)=>{
    if (Array.isArray(src))
        return src;
};

function unify_hostnames(hostname, selector){
    const hostname_len = char_count(hostname, '.')+1;
    const selector_len = char_count(selector, '.')+1;
    if (hostname_len<selector_len)
        hostname='www.'+hostname;
    else if (selector_len<hostname_len)
        selector='www.'+selector;
    return [hostname, selector];
}

function char_count(str, char){
    let count = 0;
    for (let i=0; i<str.length; i++)
    {
        if (str[i]==char)
            count++;
    }
    return count;
}

E.t = {unify_hostnames};
