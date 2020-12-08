// LICENSE_CODE ZON ISC
'use strict'; /*jslint react:true, es6:true*/
import React from 'react';
import $ from 'jquery';
import _ from 'lodash';
import moment from 'moment';
import classnames from 'classnames';
import {Route, withRouter, Link} from 'react-router-dom';
import React_tooltip from 'react-tooltip';
import {Waypoint} from 'react-waypoint';
import Pure_component from '/www/util/pub/pure_component.js';
import etask from '../../../util/etask.js';
import setdb from '../../../util/setdb.js';
import ajax from '../../../util/ajax.js';
import zescape from '../../../util/escape.js';
import zutil from '../../../util/util.js';
import {status_codes, bytes_format, get_troubleshoot} from '../util.js';
import {Toolbar_button, with_resizable_cols,
    Toolbar_container, Toolbar_row, Search_box} from '../chrome_widgets.js';
import {T} from '../common/i18n.js';
import {Tooltip_bytes} from '../common.js';
import Tooltip from '../common/tooltip.js';
import ws from '../ws.js';
import './css/viewer.less';
import Preview from './req_preview.js';

const Sort_icon = ({show, dir})=>{
    if (!show)
        return null;
    const classes = classnames('small_icon_mask', {
        sort_asc: dir==-1,
        sort_desc: dir==1,
    });
    return <div className="sort_icon"><span className={classes}/></div>;
};

const Devider = ()=><div className="devider"/>;

const loader = {
    start: ()=>$('#har_viewer').addClass('waiting'),
    end: ()=>$('#har_viewer').removeClass('waiting'),
};

const enable_ssl_click = port=>etask(function*(){
    this.on('finally', ()=>{
        loader.end();
    });
    loader.start();
    yield window.fetch('/api/enable_ssl', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({port}),
    });
    const proxies = yield ajax.json({url: '/api/proxies_running'});
    setdb.set('head.proxies_running', proxies);
});

class Har_viewer extends Pure_component {
    moving_width = false;
    min_width = 50;
    state = {
        cur_preview: null,
        tables_width: 200,
        search: this.props.domain||'',
        type_filter: 'All',
        filters: {
            port: this.props.port||false,
            status_code: this.props.code||false,
            protocol: this.props.protocol||false,
        },
    };
    componentDidMount(){
        window.document.addEventListener('mousemove', this.on_mouse_move);
        window.document.addEventListener('mouseup', this.on_mouse_up);
        this.setdb_on('head.proxies_running', proxies=>{
            if (proxies)
                this.setState({proxies});
        });
        this.setdb_on('head.settings', settings=>{
            if (settings)
                this.setState({logs: settings.logs});
        });
        this.etask(function*(){
            const suggestions = yield ajax.json(
                {url: '/api/logs_suggestions'});
            suggestions.status_codes.unshift(...[2, 3, 4, 5].map(v=>`${v}**`));
            setdb.set('head.logs_suggestions', suggestions);
        });
    }
    willUnmount(){
        loader.end();
        window.document.removeEventListener('mousemove', this.on_mouse_move);
        window.document.removeEventListener('mouseup', this.on_mouse_up);
    }
    open_preview = req=>this.setState({cur_preview: req});
    close_preview = ()=>this.setState({cur_preview: null});
    start_moving_width = e=>{
        if (e.nativeEvent.which!=1)
            return;
        this.moving_width = true;
        $(this.main_panel).addClass('moving');
        this.start_offset = e.pageX;
        this.start_width = this.state.tables_width;
    };
    on_resize_width = e=>{
        const offset = e.pageX-this.start_offset;
        let new_width = this.start_width+offset;
        if (new_width<this.min_width)
            new_width = this.min_width;
        const max_width = this.main_panel.offsetWidth-this.min_width;
        if (new_width>max_width)
            new_width = max_width;
        this.setState({tables_width: new_width});
    };
    on_mouse_move = e=>{
        if (this.moving_width)
            this.on_resize_width(e);
    };
    on_mouse_up = ()=>{
        this.moving_width = false;
        $(this.main_panel).removeClass('moving');
    };
    clear = ()=>{
        const params = {};
        if (this.props.match && this.props.match.params.port)
            params.port = this.props.match.params.port;
        const url = zescape.uri('/api/logs_reset', params);
        const _this = this;
        this.etask(function*(){
            loader.start();
            yield ajax({url});
            _this.close_preview();
            setdb.emit_path('head.har_viewer.reset_reqs');
            loader.end();
        });
    };
    set_main_panel_ref = ref=>{ this.main_panel = ref; };
    main_panel_moving = ()=>{ $(this.main_panel).addClass('moving'); };
    main_panel_stopped_moving = ()=>{
        $(this.main_panel).removeClass('moving'); };
    on_change_search = e=>{ this.setState({search: e.target.value}); };
    set_type_filter = name=>{ this.setState({type_filter: name}); };
    set_filter = (name, {target: {value}})=>{
        this.setState(prev=>({filters: {...prev.filters, [name]: value}}));
    };
    undock = ()=>{
        if (this.props.dock_mode)
            return;
        const url = '/dock_logs';
        const opts = 'directories=0,titlebar=0,toolbar=0,location=0,'
        +'status=0,menubar=0,scrollbars=0,resizable=0,height=500,'
        +'width=800';
        const har_window = window.open(url, 'har_window', opts);
        if (window.focus)
            har_window.focus();
    };
    render(){
        if (!this.state.proxies)
            return null;
        const width = `calc(100% - ${this.state.tables_width}px`;
        const preview_style = {maxWidth: width, minWidth: width};
        const show = this.state.logs>0;
        return <div id="har_viewer" className={(show ? 'har_viewer' :
          'har_viewer_off')+' chrome'}>
          {!show &&
            <Route path={['/logs', '/proxy/:port/logs/har']}
              component={Logs_off_notice}
            />
          }
          {show &&
            <div className="main_panel vbox" ref={this.set_main_panel_ref}>
              <Toolbar
                undock={this.undock}
                dock_mode={this.props.dock_mode}
                filters={this.state.filters}
                set_filter={this.set_filter}
                proxies={this.state.proxies}
                type_filter={this.state.type_filter}
                set_type_filter={this.set_type_filter}
                clear={this.clear}
                on_change_search={this.on_change_search}
                search_val={this.state.search}
              />
              <div className="split_widget vbox flex_auto">
                <Tables_container
                  main_panel_moving={this.main_panel_moving}
                  main_panel_stopped_moving=
                    {this.main_panel_stopped_moving}
                  main_panel={this.main_panel}
                  open_preview={this.open_preview}
                  width={this.state.tables_width}
                  search={this.state.search}
                  type_filter={this.state.type_filter}
                  filters={this.state.filters}
                  cur_preview={this.state.cur_preview}
                />
                <Preview cur_preview={this.state.cur_preview}
                  style={preview_style}
                  close={this.close_preview}
                />
                <Tables_resizer show={!!this.state.cur_preview}
                  start_moving={this.start_moving_width}
                  offset={this.state.tables_width}
                />
              </div>
            </div>
          }
        </div>;
    }
}

class Toolbar extends Pure_component {
    state = {select_visible: false, filters_visible: false};
    componentDidMount(){
        this.setdb_on('har_viewer.select_visible', visible=>
            this.setState({select_visible: visible}));
        this.setdb_on('head.save_settings', save_settings=>{
            this.save_settings = save_settings;
            if (this.disable)
            {
                this.disable_logs();
                delete this.disable;
            }
        });
    }
    toggle_filters = ()=>
        this.setState({filters_visible: !this.state.filters_visible});
    disable_logs = ()=>{
        if (!this.save_settings)
        {
            this.disable = true;
            return;
        }
        const _this = this;
        this.etask(function*(){ yield _this.save_settings({logs: 0}); });
    };
    render(){
        return <Toolbar_container>
          <T>{t=><Toolbar_row>
            <Toolbar_button id="clear"
              tooltip={t('Clear')}
              on_click={this.props.clear}
            />
            {!this.props.dock_mode &&
              <Toolbar_button id="docker"
                on_click={this.props.undock}
                tooltip={t('Undock into separate window')}
              />
            }
            <Toolbar_button id="filters"
              tooltip={t('Show/hide filters')}
              on_click={this.toggle_filters}
              active={this.state.filters_visible}
            />
            <Toolbar_button id="download"
              tooltip={t('Export as HAR file')}
              href="/api/logs_har"
            />
            <Toolbar_button id="close_btn"
              tooltip={t('Disable')}
              placement="left"
              on_click={this.disable_logs}
            />
          </Toolbar_row>}</T>
          {this.state.filters_visible &&
            <Toolbar_row>
              <Search_box val={this.props.search_val}
                on_change={this.props.on_change_search}
              />
              <Type_filters filter={this.props.type_filter}
                set={this.props.set_type_filter}
              />
              <Devider/>
              <Filters set_filter={this.props.set_filter}
                filters={this.props.filters}
              />
            </Toolbar_row>
          }
        </Toolbar_container>;
    }
}

class Filters extends Pure_component {
    state = {};
    componentDidMount(){
        this.setdb_on('head.logs_suggestions', suggestions=>{
            suggestions && this.setState({suggestions});
        });
    }
    render(){
        if (!this.state.suggestions)
            return null;
        const filters = [
            {
                name: 'port',
                default_value: 'All proxy ports',
                tooltip: 'Filter requests by ports',
            },
            {
                name: 'status_code',
                default_value: 'All status codes',
                tooltip: 'Filter requests by status codes',
            },
            {
                name: 'protocol',
                default_value: 'All protocols',
                tooltip: 'Filter requests by protocols',
            },
        ];
        return <div className="filters">
          {filters.map(f=>
            <Filter key={f.name}
              tooltip={f.tooltip}
              vals={this.state.suggestions[f.name+'s']}
              val={this.props.filters[f.name]}
              set={this.props.set_filter.bind(null, f.name)}
              default_value={f.default_value}
            />
          )}
        </div>;
    }
}

const Filter = ({vals, val, set, default_value, tooltip})=>
    <Tooltip title={tooltip} placement="bottom">
      <div className="custom_filter">
        <select value={val} onChange={set}>
          <option value="">{default_value}</option>
          {vals.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <span className="arrow"/>
      </div>
    </Tooltip>;

const type_filters = [{name: 'XHR', tooltip: 'XHR and fetch'},
    {name: 'HTML', tooltip: 'HTML'}, {name: 'JS', tooltip: 'Scripts'},
    {name: 'CSS', tooltip: 'Stylesheets'}, {name: 'Img', tooltip: 'Images'},
    {name: 'Media', tooltip: 'Media'}, {name: 'Font', tooltip: 'Fonts'},
    {name: 'Other', tooltip: 'Other'}];
const Type_filters = ({filter, set})=>
    <div className="filters">
      <Type_filter name="All" on_click={set.bind(null, 'All')} cur={filter}
        tooltip="All types"/>
      <Devider/>
      {type_filters.map(f=>
        <Type_filter on_click={set.bind(null, f.name)} key={f.name}
          name={f.name} cur={filter} tooltip={f.tooltip}/>
      )}
    </div>;

const Type_filter = ({name, cur, tooltip, on_click})=>
    <Tooltip title={tooltip} placement="bottom">
      <div className={classnames('filter', {active: cur==name})}
        onClick={on_click}>{name}</div>
    </Tooltip>;

const Tables_resizer = ({show, offset, start_moving})=>{
    if (!show)
        return null;
    return <div className="data_grid_resizer"
      style={{left: offset-2}}
      onMouseDown={start_moving}
    />;
};

const Logs_off_notice = ()=>
    <div>
      <h4>
        Request logs are disabled. You can enable it back in
        &nbsp;
        <Link to="/settings">General settings</Link>
      </h4>
    </div>;

const table_cols = [
    {title: 'select', hidden: true, fixed: 27, tooltip: 'Select/unselect all'},
    {title: 'Name', sort_by: 'url', data: 'request.url',
        tooltip: 'Request url'},
    {title: 'Proxy port', sort_by: 'port', data: 'details.port'},
    {title: 'Status', sort_by: 'status_code', data: 'response.status',
        tooltip: 'Status code'},
    {title: 'Bandwidth', sort_by: 'bw', data: 'details.bw'},
    {title: 'Time', sort_by: 'elapsed', data: 'time'},
    {title: 'Peer proxy', sort_by: 'proxy_peer',
        data: 'details.proxy_peer'},
    {title: 'Troubleshooting', data: 'details.troubleshoot'},
    {title: 'Date', sort_by: 'timestamp', data: 'details.timestamp'},
];
const Tables_container = withRouter(with_resizable_cols(table_cols,
class Tables_container extends Pure_component {
    constructor(props){
        super(props);
        this.uri = '/api/logs';
        this.batch_size = 30;
        this.loaded = {from: 0, to: 0};
        this.state = {
            focused: false,
            reqs: [],
            sorted: {field: 'timestamp', dir: 1},
        };
        this.reqs_to_render = [];
        this.temp_total = 0;
        this.take_reqs_from_pool = _.throttle(this.take_reqs_from_pool, 100);
    }
    componentDidUpdate(prev_props){
        if (this.props.search!=prev_props.search)
            this.set_new_params_debounced();
        if (this.props.type_filter!=prev_props.type_filter||
            this.props.filters!=prev_props.filters)
        {
            this.set_new_params();
        }
        if (prev_props.cur_preview!=this.props.cur_preview)
            this.props.resize_columns();
    }
    componentDidMount(){
        window.addEventListener('resize', this.props.resize_columns);
        this.setdb_on('head.har_viewer.reset_reqs', ()=>{
            this.loaded.to = 0;
            this.setState({
                reqs: [],
                stats: {total: 0, sum_out: 0, sum_in: 0},
            });
        }, {init: false});
        this.setdb_on('head.har_viewer.reqs', reqs=>{
            if (reqs)
                this.setState({reqs});
        });
        this.setdb_on('head.har_viewer.stats', stats=>{
            if (stats)
                this.setState({stats});
        });
        ws.addEventListener('message', this.on_message);
    }
    willUnmount(){
        window.removeEventListener('resize', this.props.resize_columns);
        ws.removeEventListener('message', this.on_message);
        setdb.set('head.har_viewer.reqs', []);
        setdb.set('head.har_viewer.stats', null);
        setdb.set('har_viewer', null);
        this.take_reqs_from_pool.cancel();
    }
    fetch_missing_data = pos=>{
        if (this.state.stats && this.state.stats.total &&
            this.state.reqs.length==this.state.stats.total)
        {
            return;
        }
        if (pos=='bottom')
            this.get_data({skip: this.loaded.to-this.temp_total});
    };
    get_params = opt=>{
        const params = opt;
        params.limit = opt.limit||this.batch_size;
        params.skip = opt.skip||0;
        if (this.props.match.params.port)
            params.port = this.props.match.params.port;
        if (this.props.search&&this.props.search.trim())
            params.search = this.props.search;
        if (this.state.sorted)
        {
            params.sort = this.state.sorted.field;
            if (this.state.sorted.dir==1)
                params.sort_desc = true;
        }
        if (this.props.type_filter&&this.props.type_filter!='All')
            params.content_type = this.props.type_filter.toLowerCase();
        for (let filter in this.props.filters)
        {
            let val;
            if (val = this.props.filters[filter])
                params[filter] = val;
        }
        return params;
    };
    get_data = (opt={})=>{
        if (this.sql_loading)
            return;
        const params = this.get_params(opt);
        const _this = this;
        this.sql_loading = true;
        this.etask(function*(){
            this.on('finally', ()=>{
                _this.sql_loading = false;
                loader.end();
            });
            loader.start();
            const url = zescape.uri(_this.uri, params);
            const res = yield ajax.json({url});
            const reqs = res.log.entries;
            const new_reqs = [...opt.replace ? [] : _this.state.reqs, ...reqs];
            const uuids = new Set();
            const new_reqs_unique = new_reqs.filter(r=>{
                if (uuids.has(r.uuid))
                    return false;
                uuids.add(r.uuid);
                return true;
            });
            setdb.set('head.har_viewer.reqs', new_reqs_unique);
            _this.loaded.to = opt.skip+reqs.length;
            const stats = {
                total: res.total+_this.temp_total,
                sum_out: res.sum_out,
                sum_in: res.sum_in,
            };
            _this.temp_total = 0;
            if (!_this.state.stats)
                setdb.set('head.har_viewer.stats', stats);
        });
    };
    set_new_params = ()=>{
        if (this.sql_loading)
            return;
        this.loaded.to = 0;
        setdb.emit_path('head.har_viewer.dc_top');
        this.get_data({replace: true});
    };
    set_new_params_debounced = _.debounce(this.set_new_params, 400);
    set_sort = field=>{
        if (this.sql_loading)
            return;
        let dir = 1;
        if (this.state.sorted.field==field)
            dir = -1*this.state.sorted.dir;
        this.setState({sorted: {field, dir}}, this.set_new_params);
    };
    on_focus = ()=>this.setState({focused: true});
    on_blur = ()=>this.setState({focused: false});
    is_hidden = req=>{
        const cur_port = req.details.port;
        const port = this.props.match.params.port;
        if (port && cur_port!=port)
            return true;
        if (this.port_range &&
            (cur_port<this.port_range.from || cur_port>this.port_range.to))
        {
            return true;
        }
        if (this.props.search && !req.request.url.match(
            new RegExp(this.props.search)))
        {
            return true;
        }
        if (this.props.type_filter && this.props.type_filter!='All' &&
            req.details.content_type!=this.props.type_filter.toLowerCase())
        {
            return true;
        }
        if (this.props.filters.port &&
            this.props.filters.port!=req.details.port)
        {
            return true;
        }
        if (this.props.filters.protocol &&
            this.props.filters.protocol!=req.details.protocol)
        {
            return true;
        }
        if (this.props.filters.status_code &&
            this.props.filters.status_code!=req.response.status)
        {
            return true;
        }
        return false;
    };
    is_visible = r=>!this.is_hidden(r);
    on_message = event=>{
        const json = JSON.parse(event.data);
        if (json.type=='har_viewer')
            this.on_request_message(json.data);
        else if (json.type=='har_viewer_start')
            this.on_request_started_message(json.data);
    };
    on_request_started_message = req=>{
        req.pending = true;
        this.on_request_message(req);
    };
    on_request_message = req=>{
        this.reqs_to_render.push(req);
        this.take_reqs_from_pool();
    };
    take_reqs_from_pool = ()=>{
        if (!this.reqs_to_render.length)
            return;
        const reqs = this.reqs_to_render.filter(this.is_visible);
        const all_reqs = this.reqs_to_render;
        if (this.batch_size>this.state.reqs.length)
        {
            this.loaded.to = Math.min(this.batch_size,
                this.state.reqs.length + reqs.length);
        }
        const new_reqs_set = {};
        [...this.state.reqs, ...reqs].forEach(r=>{
            if (!new_reqs_set[r.uuid])
                return new_reqs_set[r.uuid] = r;
            if (new_reqs_set[r.uuid].pending)
                new_reqs_set[r.uuid] = r;
        });
        const sorted_field = this.props.cols.find(
            c=>c.sort_by==this.state.sorted.field).data;
        const dir = this.state.sorted.dir;
        const new_reqs = Object.values(new_reqs_set)
        .sort((a, b)=>{
            const val_a = zutil.get(a, sorted_field);
            const val_b = zutil.get(b, sorted_field);
            if (val_a==val_b)
                return a.uuid > b.uuid ? -1*dir : dir;
            return val_a > val_b ? -1*dir : dir;
        }).slice(0, Math.max(this.state.reqs.length, this.batch_size));
        this.reqs_to_render = [];
        this.setState(prev=>{
            const new_state = {reqs: new_reqs};
            if (prev.stats)
            {
                new_state.stats = {
                    total: prev.stats.total+
                        all_reqs.filter(r=>r.pending).length,
                    sum_out: prev.stats.sum_out+all_reqs.reduce((acc, r)=>
                        acc+(r.details.out_bw||0), 0),
                    sum_in: prev.stats.sum_in+all_reqs.reduce((acc, r)=>
                        acc+(r.details.in_bw||0), 0),
                };
            }
            else
                this.temp_total += all_reqs.filter(r=>r.pending).length;
            return new_state;
        });
    };
    on_mouse_up = ()=>{
        this.moving_col = null;
        this.props.main_panel_stopped_moving();
    };
    render(){
        const style = {};
        if (this.props.cur_preview)
        {
            style.flex = `0 0 ${this.props.width}px`;
            style.width = this.props.width;
            style.maxWidth = this.props.width;
        }
        return <div className="tables_container vbox"
          tabIndex="-1"
          style={style}
          onFocus={this.on_focus}
          onBlur={this.on_blur}>
          <div className="reqs_container">
            <Header_container cols={this.props.cols}
              reqs={this.state.reqs}
              sort={this.set_sort}
              sorted={this.state.sorted}
              only_name={!!this.props.cur_preview}/>
            <Data_container cols={this.props.cols}
              fetch_missing_data={this.fetch_missing_data}
              reqs={this.state.reqs}
              focused={this.state.focused}
              cur_preview={this.props.cur_preview}
              open_preview={this.props.open_preview}/>
          </div>
          <Summary_bar stats={this.state.stats}/>
        </div>;
    }
}));

class Summary_bar extends Pure_component {
    render(){
        let {total, sum_in, sum_out} = this.props.stats||
            {total: 0, sum_in: 0, sum_out: 0};
        sum_out = bytes_format(sum_out)||'0 B';
        sum_in = bytes_format(sum_in)||'0 B';
        const txt = t=>`${total} ${t('requests')} | ${sum_out} ${t('sent')} `
            +`| ${sum_in} ${t('received')}`;
        return <div className="summary_bar">
          <span>
            <T>{t=><Tooltip title={txt(t)}>{txt(t)}</Tooltip>}</T>
          </span>
        </div>;
    }
}

class Header_container extends Pure_component {
    click = col=>{
        this.props.sort(col.sort_by);
    };
    render(){
        let {cols, only_name, sorted} = this.props;
        if (!cols)
            return null;
        if (only_name)
            cols = [cols[1]];
        return <div className="header_container">
          <table className="chrome_table">
            <colgroup>
              {cols.map((c, idx)=>
                <col key={c.title}
                  style={{width: only_name||idx==cols.length-1 ?
                    'auto' : c.width}}/>
              )}
            </colgroup>
            <tbody>
              <tr>
                {cols.map(c=>
                  <T key={c.title}>{t=>
                    <Tooltip title={t(c.tooltip||c.title)}>
                      <th key={c.title} onClick={()=>this.click(c)}
                        style={{textAlign: only_name ? 'left' : null}}>
                        <div>{t(c.title)}</div>
                        <Sort_icon show={c.sort_by==sorted.field}
                          dir={sorted.dir}/>
                      </th>
                    </Tooltip>
                  }</T>
                )}
              </tr>
            </tbody>
          </table>
        </div>;
    }
}

class Data_container extends Pure_component {
    componentDidMount(){
        this.setdb_on('head.har_viewer.dc_top', ()=>{
            if (this.dc.current)
                this.dc.current.scrollTop = 0;
        });
    }
    handle_viewpoint_enter = ()=>{
        this.props.fetch_missing_data('bottom');
    };
    dc = React.createRef();
    render(){
        let {cols, open_preview, cur_preview, focused, reqs} = this.props;
        const preview_mode = !!cur_preview;
        cols = (cols||[]).map((c, idx)=>{
            if (!preview_mode)
                return c;
            if (preview_mode && idx==1)
                return {...c, width: 'auto'};
            return {...c, width: 0};
        });
        return <div ref={this.dc} className="data_container">
          <table className="chrome_table">
            <colgroup>
              {cols.map((c, idx)=>
                <col key={c.title}
                  style={{width: !preview_mode && idx==cols.length-1 ?
                    'auto': c.width}}
                />
              )}
            </colgroup>
            <Data_rows reqs={reqs}
              cols={cols}
              open_preview={open_preview}
              cur_preview={cur_preview}
              focused={focused}
            />
          </table>
          <Waypoint key={reqs.length}
            scrollableAncestor={this.dc.current}
            bottomOffset="-50px"
            onEnter={this.handle_viewpoint_enter}
          />
        </div>;
    }
}

class Data_rows extends React.Component {
    shouldComponentUpdate(next_props){
        return next_props.reqs!=this.props.reqs ||
            next_props.cur_preview!=this.props.cur_preview ||
            next_props.focused!=this.props.focused;
    }
    render(){
        return <tbody>
          {this.props.reqs.map(r=>
            <Data_row cols={this.props.cols}
              key={r.uuid}
              open_preview={this.props.open_preview}
              cur_preview={this.props.cur_preview}
              focused={this.props.focused}
              req={r}
            />
          )}
          <tr className="filler">
            {this.props.cols.map(c=><td key={c.title}/>)}
          </tr>
        </tbody>;
    }
}

class Data_row extends React.Component {
    shouldComponentUpdate(next_props){
        const selected = zutil.get(this.props.cur_preview, 'uuid')==
            this.props.req.uuid;
        const will_selected = zutil.get(next_props.cur_preview, 'uuid')==
            next_props.req.uuid;
        const selection_changed = selected!=will_selected;
        const focused_changed = this.props.focused!=next_props.focused;
        const pending_changed = this.props.req.pending!=next_props.req.pending;
        return selection_changed||focused_changed&&selected||pending_changed;
    }
    cell_clicked = idx=>{
        if (idx==0)
            return;
        if (this.props.cols[idx].title=='Time')
            setdb.emit('har_viewer.set_pane', 3);
        if (this.props.cols[idx].title=='Troubleshooting')
            setdb.emit('har_viewer.set_pane', 5);
        this.props.open_preview(this.props.req);
    };
    render(){
        const {cur_preview, cols, focused, req} = this.props;
        const selected = zutil.get(cur_preview, 'uuid')==req.uuid;
        const classes = classnames({
            selected,
            focused: selected&&focused,
            error: !req.details.success&&!req.pending,
            pending: !!req.pending,
        });
        return <tr className={classes}>
          {cols.map((c, idx)=>
            <td key={c.title} onClick={()=>this.cell_clicked(idx)}>
              <Cell_value col={c.title} req={req}/>
            </td>
          )}
        </tr>;
    }
}

const maybe_pending = Component=>function pies(props){
    if (props.pending)
    {
        return <Tooltip title="The request is still loading">
          <div className="disp_value">pending</div>
        </Tooltip>;
    }
    return <Component {...props}/>;
};

class Cell_value extends React.Component {
    render(){
        const {col, req, req: {details: {timeline, rules}}} = this.props;
        if (col=='Name')
            return <Name_cell req={req} timeline={timeline} rules={rules}/>;
        else if (col=='Status')
        {
            return <Status_code_cell status={req.response.status}
                  pending={!!req.pending} uuid={req.uuid} req={req}/>;
        }
        else if (col=='Proxy port')
            return <Tooltip_and_value val={req.details.port}/>;
        else if (col=='Bandwidth')
            return <Tooltip_bytes chrome_style bytes={req.details.bw}/>;
        else if (col=='Time')
        {
            return <Time_cell time={req.time} url={req.request.url}
                  pending={!!req.pending} uuid={req.uuid}
                  port={req.details.port}/>;
        }
        else if (col=='Peer proxy')
        {
            const ip = req.details.proxy_peer;
            const ext_proxy = (setdb.get('head.proxies_running')||[])
                .some(p=>p.port==req.details.port && p.ext_proxies);
            let val;
            if (ip && (ip=='superproxy bypass' || ip.length < 16))
                val = ip;
            else if (ip)
                val = `...${ip.slice(-5)}`;
            else
                val = '';
            const tip = ext_proxy ? 'This feature is only available when '
                +'using proxies by Luminati network' : ip;
            return <Tooltip_and_value val={val} tip={tip}
                pending={!!req.pending}/>;
        }
        else if (col=='Date')
        {
            const local = moment(new Date(req.details.timestamp))
                .format('YYYY-MM-DD HH:mm:ss');
            return <Tooltip_and_value val={local}/>;
        }
        else if (col=='Troubleshooting')
        {
            const troubleshoot = get_troubleshoot(req.response.content.text,
                req.response.status, req.response.headers);
            return <Tooltip_and_value val={troubleshoot.title}/>;
        }
        return col;
    }
}

class Name_cell extends Pure_component {
    go_to_rules = e=>setdb.emit('har_viewer.set_pane', 4);
    render(){
        const {req, rules} = this.props;
        const rule_tip = 'At least one rule has been applied to this '
        +'request. Click to see more details';
        const status_check = req.details.context=='STATUS CHECK';
        const is_ban = r=>Object.keys(r.action||{})
            .some(a=>a.startsWith('ban_ip'));
        const bad = (rules||[]).some(is_ban);
        const icon_classes = classnames('small_icon', 'rules', {
            good: !bad, bad});
        return <div className="col_name">
          <div>
            <div className="icon script"/>
            {!!rules && !!rules.length &&
              <Tooltip title={rule_tip}>
                <div onClick={this.go_to_rules} className={icon_classes}/>
              </Tooltip>
            }
            <Tooltip title={req.request.url}>
              <div className="disp_value">
                {req.request.url + (status_check ? ' (status check)' : '')}
              </div>
            </Tooltip>
          </div>
        </div>;
    }
}

const Status_code_cell = maybe_pending(props=>{
    const {status, uuid, req} = props;
    const get_desc = ()=>{
        const err_header = req.response.headers.find(
            r=>r.name=='x-luminati-error'||r.name=='x-lpm-error');
        if (status==502 && err_header)
            return err_header.value;
        return status=='canceled' ? '' : status_codes[status];
    };
    if (status=='unknown')
    {
        return <Encrypted_cell name="Status code"
          id={`s${uuid}`}
          port={req.details.port}
        />;
    }
    const desc = get_desc(status);
    return <Tooltip title={`${status} ${desc}`}>
      <div className="disp_value">{status}</div>
    </Tooltip>;
});

const Time_cell = maybe_pending(props=>{
    const {port, time, url, uuid} = props;
    if (!url.endsWith(':443') || !time)
        return <Tooltip_and_value val={time && time+' ms'}/>;
    return <Encrypted_cell name="Timing" id={`t${uuid}`} port={port}/>;
});

class Encrypted_cell extends Pure_component {
    state = {proxies: []};
    componentDidMount(){
        this.setdb_on('head.proxies_running', proxies=>{
            if (!proxies)
                return;
            this.setState({proxies});
        });
    }
    is_ssl_on = port=>{
        const proxy = this.state.proxies.find(p=>p.port==port);
        if (!proxy)
            return false;
        return proxy.ssl;
    };
    render(){
        const {id, name, port} = this.props;
        const ssl = this.is_ssl_on(port);
        return <div onClick={e=>e.stopPropagation()} className="disp_value">
          <React_tooltip id={id}
            type="info"
            effect="solid"
            delayHide={100}
            delayShow={0}
            delayUpdate={500}
            offset={{top: -10}}>
            <div>
              {name} of this request could not be parsed because the
              connection is encrypted.
            </div>
            {!ssl &&
                <div style={{marginTop: 10}}>
                  <a onClick={()=>enable_ssl_click(port)}
                    className="link">
                    Enable SSL analyzing
                  </a>
                  <span>
                    to see {name} and other information about requests
                  </span>
                </div>
            }
            {ssl &&
                <div style={{marginTop: 10}}>
                  SSL analyzing is already turned on and all the future
                  requestes will be decoded. This request can't be decoded
                  retroactively
                </div>
            }
          </React_tooltip>
          <div data-tip="React-tooltip" data-for={id}>
            <span>unknown</span>
            <div className="small_icon status info"/>
          </div>
        </div>;
    }
}

const Tooltip_and_value = maybe_pending(({val, tip})=>
    <Tooltip title={tip||val}>
      <div className="disp_value">{val||'—'}</div>
    </Tooltip>
);

export default Har_viewer;