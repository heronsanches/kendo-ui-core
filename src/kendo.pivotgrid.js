(function(f, define){
    define([ "./kendo.dom" ], f);
})(function(){

var __meta__ = {
    id: "pivotgrid",
    name: "PivotGrid",
    category: "web",
    description: "The PivotGrid widget is a data summarization tool.",
    depends: [ "dom", "data" ]
};

/*jshint eqnull: true*/
(function($, undefined) {
    var kendo = window.kendo,
        ui = kendo.ui,
        Class = kendo.Class,
        Widget = ui.Widget,
        DataSource = kendo.data.DataSource,
        toString = {}.toString,
        identity = function(o) { return o; },
        map = $.map,
        extend = $.extend,
        CHANGE = "change",
        DIV = "<div/>",
        LAYOUT_TABLE = '<table class="k-pivot-layout">' +
                            '<tr>' +
                                '<td>' +
                                    '<div class="k-pivot-rowheaders"></div>' +
                                '</td>' +
                                '<td>' +
                                    '<div class="k-pivot-table k-state-default"></div>' +
                                '</td>' +
                            '</tr>' +
                        '</table>';

    function normalizeMembers(member) {
        var descriptor = typeof member === "string" ? { name: member, expand: false } : member,
            descriptors = toString.call(descriptor) === "[object Array]" ? descriptor : (descriptor !== undefined ? [descriptor] : []);

        return map(descriptors, function(d) {
            if (typeof d === "string") {
                return { name: d, expand: false };
            }
            return { name: d.name, expand: d.expand };
        });
    }

    function accumulateMembers(accumulator, tuples) {
        var members;
        var name;
        var parentName;

        for (var idx = 0; idx < tuples.length; idx++) {
            members = tuples[idx].members;

            for (var memberIdx = 0; memberIdx < members.length; memberIdx++) {
                if (members[memberIdx].measure) {
                    continue;
                }

                name = members[memberIdx].name/*.replace(/\.\[all\]$/i, "")*/;
                parentName = (members[memberIdx].parentName || "")/*.replace(/\.\[all\]$/i, "")*/;

                if (members[memberIdx].children.length > 0) {
                    accumulator[name] = true;
                    accumulateMembers(accumulator, members[memberIdx].children);
                } else if (!(parentName in accumulator)) {
                    accumulator[name] = false;
                }
            }
        }
    }

    function descriptorsForAxes(tuples) {
        var result = {};

        accumulateMembers(result, tuples);

        var descriptors = [];
        for (var k in result) {
            descriptors.push({ name: k, expand: result[k] });
        }

        return descriptors;
    }

    var PivotDataSource = DataSource.extend({
        init: function(options) {
            DataSource.fn.init.call(this, extend(true, {}, {
                schema: {
                    axes: identity
                }
            }, options));

            this._columns = normalizeMembers(this.options.columns);
            this._rows = normalizeMembers(this.options.rows);

            var measures = this.options.measures || [];
            var measuresAxis = "columns";

            if (this.options.measures !== null && toString.call(this.options.measures) === "[object Object]") {
                measures = this.options.measures.values || [];
                measuresAxis = this.options.measures.axis || "columns";
            }

            this._measures = measures || [];
            this._measuresAxis = measuresAxis;

            this._axes = {};
        },

        options: {
            serverSorting: true,
            serverPaging: true,
            serverFiltering: true,
            serverGrouping: true,
            serverAggregates: true
        },

        axes: function() {
            return this._axes;
        },

        columns: function() {
            return this._columns;
        },

        rows: function() {
            return this._rows;
        },

        measures: function() {
            return this._measures;
        },

        measuresAxis: function() {
            return this._measuresAxis || "columns";
        },

        _expandPath: function(path, axis) {
            var origin = axis === "columns" ? "columns" : "rows";
            var other = axis === "columns" ? "rows" : "columns";

            var axes = this.axes();

            var members = normalizeMembers(path);
            var memberToExpand = members[members.length - 1].name;
            var axis1 = this[origin]();

            var idx;
            if (members.length < axis1.length && axes[origin]) {
                var originFirstTuple = (axes[origin].tuples || [])[0];

                if (originFirstTuple) {
                    axis1 = originFirstTuple.members;
                    for (idx = 0; idx < axis1.length; idx++) {
                        var found = false;
                        for (var j = 0; j < members.length; j++) {
                            if (members[j].name.indexOf(axis1[idx].hierarchy) === 0) {
                                found = true;
                                break;
                            }
                        }

                        if (!found) {
                            members.push(axis1[idx]);
                        }
                    }
                }
            }

            var measures = this.measures();
            if (measures.length > 1) {
                members.push({
                    name: "Measures",
                    measure: true,
                    children: normalizeMembers(measures)
                });
            }

            var tupletoSearch = {
                members: members
            };

            var descriptors = this[origin]() || [];

            if (axes && axes[origin]) {
                var result = findExistingTuple(axes[origin].tuples, tupletoSearch);
                if (result) {
                    members = descriptorsForAxes([result.tuple]);
                }
            }

            for (idx = 0; idx < members.length; idx++) {
                if (members[idx].name === memberToExpand) {
                    members[idx].expand = true;
                }
            }

            var descriptors = {};
            descriptors[origin] = members;
            descriptors[other] = this._descriptorsForAxis(other);

            this._query(descriptors);
        },

        _descriptorsForAxis: function(axis) {
            var axes = this.axes();
            var descriptors = this[axis]() || [];

            if (axes && axes[axis]) {
                descriptors = descriptorsForAxes(axes[axis].tuples || []);
            }
            return descriptors;
        },

        columnsAxisDescriptors: function() {
            return this._descriptorsForAxis("columns");
        },

        rowsAxisDescriptors: function() {
            return this._descriptorsForAxis("rows");
        },

        _process: function (data, e) {
            this._view = data;

            e = e || {};
            e.items = e.items || this._view;

            this.trigger(CHANGE, e);
        },

        _query: function(options) {
            var that = this;

            that.query(extend({}, {
                page: that.page(),
                pageSize: that.pageSize(),
                sort: that.sort(),
                filter: that.filter(),
                group: that.group(),
                aggregate: that.aggregate(),
                columns: this.columnsAxisDescriptors(),
                rows: this.rowsAxisDescriptors(),
                measures: this.measures()
            }, options));
        },

        query: function(options) {
            this.read(this._mergeState(options));
        },

        _mergeState: function(options) {
            options = DataSource.fn._mergeState.call(this, options);

            if (options !== undefined) {
                this._measures = options.measures || [];
        //        this._columns = options.columns || [];
         //       this._rows = options.rows || [];

                if (options.columns) {
                   options.columns = normalizeMembers(options.columns);
                }

                if (options.rows) {
                   options.rows = normalizeMembers(options.rows);
                }
            }
            return options;
        },

        filter: function(val) {
            if (val === undefined) {
                return this._filter;
            }

            this._axes = {};
            this._data = this._observe([]);

            this._query({ filter: val, page: 1 });
        },

        expandColumn: function(path) {
            this._expandPath(path, "columns");
        },

        expandRow: function(path) {
            this._expandPath(path, "rows");
        },

        _readData: function(data) {
            var axes = this.reader.axes(data);
            var newData = this.reader.data(data);

            newData = this._normalizeData(newData, axes);

            var result = this._mergeAxes(axes, newData);
            this._axes = result.axes;

            return result.data;
        },

        _mergeAxes: function(sourceAxes, data) {
            var columnMeasures = this.measuresAxis() === "columns";
            var axes = {
                columns: normalizeAxis(this._axes.columns),
                rows: normalizeAxis(this._axes.rows)
            };

            sourceAxes = {
                columns: normalizeAxis(sourceAxes.columns),
                rows: normalizeAxis(sourceAxes.rows)
            };

            var newColumnsLength = sourceAxes.columns.tuples.length;
            var newRowsLength = sourceAxes.rows.tuples.length;
            var oldColumnsLength = membersCount(axes.columns.tuples);

            var tuples = parseSource(sourceAxes.columns.tuples, columnMeasures ? this.measures() : []);
            var mergedColumns = mergeTuples(axes.columns.tuples, tuples);

            tuples = parseSource(sourceAxes.rows.tuples, !columnMeasures ? this.measures() : []);
            var mergedRows = mergeTuples(axes.rows.tuples, tuples);

            axes.columns.tuples = mergedColumns.tuple;
            axes.rows.tuples = mergedRows.tuple;

            if (oldColumnsLength !== membersCount(axes.columns.tuples)) {
                //columns are expanded
                var offset = oldColumnsLength + newColumnsLength;
                if (oldColumnsLength) {
                    offset--;
                }
                data = this._mergeColumnData(data, mergedColumns.deep, newRowsLength, newColumnsLength, offset);
            } else {
                //rows are expanded
                data = this._mergeRowData(data, mergedRows.deep, newColumnsLength);
            }

            return {
                axes: axes,
                data: data
            };
        },

        _mergeColumnData: function(newData, columnIndex, rowsLength, columnsLength, offset) {
            var counter, index;
            var data = this.data().toJSON();
            var drop = 0;

            rowsLength = Math.max(rowsLength, 1);
            if (data.length > 0) {
                columnIndex--;
                drop = 1;
            }

            for (counter = 0; counter < rowsLength; counter ++) {
                index = columnIndex + (counter * offset);
                [].splice.apply(data, [index, drop].concat(newData.splice(0, columnsLength)));
            }

            return data;
        },

        _mergeRowData: function(newData, rowIndex, drop) {
            var data = this.data().toJSON();

            if (data.length === 0) {
                drop = 0;
            } else if (drop === 0) {
                drop = 1;
                rowIndex--;
            }

            newData.splice(0, drop);
            [].splice.apply(data, [rowIndex + drop, 0].concat(newData));

            return data;
        },

        _normalizeData: function(data, axes) {
            if (!data.length) {
                return data;
            }

            var columns = (axes.columns || {}).tuples || [];
            var rows = (axes.rows || {}).tuples || [];
            var cell;
            var axesLength = (columns.length || 1) * (rows.length || 1);
            var idx, length;

            var result = new Array(axesLength);

            if (data.length === axesLength) {
                return data;
            }

            for (idx = 0, length = result.length; idx < length; idx++) {
                result[idx] = { value: "", fmtValue: "", ordinal: idx };
            }

            for (idx = 0, length = data.length; idx < length; idx++) {
               cell = data[idx];
               result[cell.ordinal] = cell;
            }

            return result;
        },

        _params: function(data) {
            var options = DataSource.fn._params.call(this, data);

            options = extend({
                measures: this.measures(),
                measuresAxis: this.measuresAxis(),
                columns: this.columns(),
                rows: this.rows()
            }, options);

            return options;
        }
    });

    function membersCount(tuples) {
        if (!tuples.length) {
            return 0;
        }

        var queue = tuples.slice();
        var current = queue.shift();
        var idx, length, result = 1;

        while (current) {
            if (current.members) {
                [].push.apply(queue, current.members);
            } else if (current.children) {
                result += current.children.length;
                [].push.apply(queue, current.children);
            }

            current = queue.shift();
        }

        return result;
    }

    function normalizeAxis(axis) {
        if (!axis) {
            axis = {
                tuples: []
            };
        }

        if (!axis.tuples) {
            axis.tuples = [];
        }

        return axis;
    }

    function mergeTuples(target, source) {
        if (!source[0]) {
            return {
                tuple: target,
                deep: 0
            };
        }

        var result = findExistingTuple(target, source[0]);

        if (!result || !result.tuple) {
            return {
                tuple: source,
                deep: 0
            };
        }

        var targetMembers = result.tuple.members;
        for (var idx = 0, len = source.length; idx < len; idx ++) {
            var sourceMembers = source[idx].members;
            for (var memberIndex = 0, memberLen = targetMembers.length; memberIndex < memberLen; memberIndex ++) {
                if (!targetMembers[memberIndex].measure && sourceMembers[memberIndex].children[0]) {
                    targetMembers[memberIndex].children = sourceMembers[memberIndex].children;
                }
            }
        }

        return {
            tuple: target,
            deep: result.deep
        };
    }

    function findExistingTuple(tuples, current) {
        var members = current.members;
        var result;
        for (var i = 0; i < members.length; i ++) {
            result = findTuple(tuples, members[i].name, i);
            if (!result.tuple) {
                return null;
            }
            if (equalMembers(result.tuple.members, members)) {
                return result;
            }
        }

        return null;
    }

    function equalMembers(first, second) {
        var result = true;
        var length = first.length;
        for (var i = 0; i < length && result; i ++) {
            result = result && (first[i].name == second[i].name);
        }

        return result;
    }

    function findTuple(tuples, name, index) {
        var tuple, member;
        var idx , length;
        var deep = 0;
        var result;

        for (idx = 0, length = tuples.length; idx < length; idx ++) {
            deep++;
            tuple = tuples[idx];
            member = tuple.members[index];

            if (member.name == name) {
                return {
                    tuple: tuple,
                    deep: deep
                };
            }

            result = findTuple(member.children, name, index);
            deep += result.deep;
            if (result.tuple) {
                result.deep = deep;
                return result;
            }
        }

        //return tuple;
        return {
            tuple: null,
            deep: deep
        };
    }

    function addMembers(members, map) {
        var member, i, len, path = "";
        for (i = 0, len = members.length; i < len; i++) {
            member = members[i];
            path += member.name;
            if (!map[path]) {
                map[path] = member;
            }
        }
    }

    function findParentMember(tuple, map) {
        var members = tuple.members;
        var i, len, member, path = "";
        var parentPath = "";
        var parentMember;

        for (i = 0, len = members.length; i < len; i++) {
            member = members[i];
            if (parentMember) {
                if (map[path + member.name]) {
                    path += member.name;
                    parentMember = map[path];
                    continue;
                } else if (map[path + member.parentName]) {
                    return map[path + member.parentName];
                } else {
                    if (member.parentName) {
                        parentPath += member.parentName;
                    }
                    return map[parentPath];
                }
            }

            path += member.name;
            parentMember = map[member.parentName];

            if (!parentMember) {
                parentMember = map[path];
                if (!parentMember) {
                    return null;
                }
            }

            if (parentMember) {
                parentPath += parentMember.name;
            }
        }

        return parentMember;
    }

    function measurePosition(tuple, measures) {
        if (measures.length < 2) {
            return -1;
        }

        var measure = measures[0];
        var members = tuple.members;
        for (var idx = 0, len = members.length; idx < len; idx ++) {
            if (members[idx].name == measure) {
                return idx;
            }
        }
    }

    function normalizeMeasures(tuple, index) {
        if (index < 0) {
            return;
        }
        var member = {
            name: "Measures",
            measure: true,
            children: [
                tuple.members[index]
            ]
        };
        tuple.members.splice(index, 1, member);
    }

    function parseSource(tuples, measures) {
        if (tuples.length < 1) {
            return [];
        }
        var result = [];
        var map = { };
        var measureIndex = measurePosition(tuples[0], measures);

        for (var i = 0; i < tuples.length; i++) {
            var tuple = tuples[i];
            normalizeMeasures(tuple, measureIndex);
            var parentMember = findParentMember(tuple, map);

            if (parentMember) {
                if (measureIndex < 0 || !parentMember.measure) {
                    parentMember.children.push(tuple);
                } else {
                    parentMember.children.push(tuple.members[measureIndex].children[0]);
                }
            } else {
                result.push(tuple);
            }

            addMembers(tuple.members, map);
        }

        return result;
    }

    PivotDataSource.create = function(options) {
        options = options && options.push ? { data: options } : options;

        var dataSource = options || {},
            data = dataSource.data;

        dataSource.data = data;

        if (!(dataSource instanceof PivotDataSource) && dataSource instanceof kendo.data.DataSource) {
            throw new Error("Incorrect DataSource type. Only PivotDataSource instances are supported");
        }

        return dataSource instanceof PivotDataSource ? dataSource : new PivotDataSource(dataSource);
    };

    function transformDescriptors(members, mapFunction) {
        var result = [];

        for (var idx = 0; idx < members.length; idx++) {
            result.push(mapFunction(members[idx]));
        }

        return result;
    }

    function trimSameHierarchyChildDescriptors(members) {
        var result = [];

        for (var idx = 0; idx < members.length; idx++) {
            var found = false;
            var name = members[idx].name;

            for (var j = 0; j < members.length; j++) {
                var memberName = members[j].name;
                if (name.indexOf(memberName) === 0 && memberName !== name) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                result.push(members[idx]);
            }
        }

        return result;
    }

    function trimSameHierarchyChildDescriptorsForName(members, memberName) {
        var result = [];

        for (var idx = 0; idx < members.length; idx++) {
            var name = members[idx].name;

            if (memberName == name || !(name.indexOf(memberName) === 0 || memberName.indexOf(name) === 0)) {
                result.push(members[idx]);
            }
        }

        return result;
    }

    function sameHierarchyDescriptors(members) {
        var same = {};

        for (var idx = 0; idx < members.length; idx++) {
            var name = members[idx].name;

            for (var j = 0; j < members.length; j++) {
                var memberName = members[j].name;
                if ((memberName.indexOf(name) === 0 || name.indexOf(memberName) === 0) && memberName !== name) {
                    same[name] = members[idx];
                }
            }
        }

        var result = [];

        for (var key in same) {
            result.push(same[key]);
        }

        return result;
    }


    function expandMemberDescriptor(members, memberNames) {
        return transformDescriptors(members, function(member) {
            var name = member.name;

            var found = false;

            for (var idx = 0; idx < memberNames.length; idx++) {
                if (name === memberNames[idx]) {
                    found = true;
                    break;
                }
            }

            if (member.expand && found) {
                if (name.indexOf("&") == -1) {
                    name += ".[ALL]";
                }
                name += ".Children";

            } else if (name.indexOf("&") == -1) {
                name += ".[(ALL)].MEMBERS";
            }

            return name;
        });
    }

    function expandDescriptors(members) {
        return transformDescriptors(members, function(member) {
            var name = member.name;

            if (member.expand) {
                if (name.indexOf("&") == -1) {
                    name += ".[ALL]";
                }
                name += ".Children";
            } else if (name.indexOf("&") == -1) {
                name += ".[(ALL)].MEMBERS";
            }
            return name;
        });
    }

    function convertMemberDescriptors(members) {
        return transformDescriptors(members, function(member) {
            var name = member.name;

            if (name.indexOf("&") == -1) {
                name += ".[(ALL)].MEMBERS";
            }

            return name;
        });
    }

    function crossJoin(names) {
        var result = "CROSSJOIN({";
        var r;
        if (names.length > 2) {
            r = names.pop();
            result += crossJoin(names);
        } else {
            result += names.shift();
            r = names.pop();
        }
        result += "},{";
        result += r;
        result += "})";
        return result;
    }

    function crossJoinCommand(members, measures) {
        var tmp = members;
        if (measures.length > 1) {
            tmp.push("{" + measures.join(",") + "}");
        }
        return crossJoin(tmp);
    }

    function expandedMembers(members) {
        var result = [];

        for (var idx = 0; idx < members.length; idx++) {
            if (members[idx].expand) {
                result.push(members[idx]);
            }
        }

        return result;
    }

    function removeAllFromDescriptors(descriptors) {
        for (var idx = 0; idx < descriptors.length; idx++) {
            descriptors[idx].name = descriptors[idx].name.replace(/\.\[all\]$/i, "")
        }
        return descriptors;
    }

    function serializeMembers(members, measures) {
        var command = "";

        members = members || [];

        var memberNames = convertMemberDescriptors(trimSameHierarchyChildDescriptors(members));
        var expandedColumns = expandedMembers(members);

        if (memberNames.length > 1 || measures.length > 1) {
            command += crossJoinCommand(memberNames, measures);

            if (expandedColumns.length) {
                var start = 0;
                var idx;
                var j;
                var name;

                var expandedMemberNames = [];
                var sameHierarchyMembers = sameHierarchyDescriptors(members);

                var generatedMembers = [];

                for (idx = 0; idx < expandedColumns.length; idx++) {

                    for (j=start; j < expandedColumns.length; j++) {
                        name = expandedColumns[j].name;

                        var tmpMembers = trimSameHierarchyChildDescriptors(members);

                        if ($.inArray(expandedColumns[j], sameHierarchyMembers) > -1) {
                            tmpMembers = trimSameHierarchyChildDescriptorsForName(members, name);
                        }

                        var tmp = crossJoinCommand(expandMemberDescriptor(tmpMembers, expandedMemberNames.concat(name)), measures);
                        if ($.inArray(tmp, generatedMembers) == -1) {
                            command += ",";
                            command += tmp;
                            generatedMembers.push(tmp);
                        }
                    }
                    start++;
                    expandedMemberNames.push(expandedColumns[idx].name);
                }
            }
        } else {
            if (expandedColumns.length) {
                memberNames = memberNames.concat(expandDescriptors(members));
            }
            command += memberNames.join(",");
        }

        return command;
    }

    var filterFunctionFormats = {
        contains: ", InStr({0}.MemberValue,\"{1}\")",
        startswith: ", Left({0}.MemberValue,Len(\"{1}\"))=\"{1}\"",
        endswith: ", Right({0}.MemberValue,Len(\"{1}\"))=\"{1}\""
    }

    function serializeFilters(filter) {
        var command = "";

        var filters = filter.filters;
        for (var idx = 0; idx < filters.length; idx++) {
            if (filters[idx].operator == "in") {
                command += "{";
                command += filters[idx].value;
                command += "}";
            } else {
                command += "Filter("

                var name = filters[idx].field;

                if (name.indexOf("&") == -1) {
                    name += ".[ALL]";
                }

                name += ".Children";

                command += name;
                command += kendo.format(filterFunctionFormats[filters[idx].operator], filters[idx].field, filters[idx].value);
                command += ")";
            }

            if (idx < filters.length - 1) {
                command += ",";
            }
        }

        return command;
    }

    var convertersMap = {
        read: function(options, type) {
            var command = '<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Header/><Body><Execute xmlns="urn:schemas-microsoft-com:xml-analysis"><Command><Statement>';

            command += "SELECT NON EMPTY {";

            var columns = removeAllFromDescriptors(options.columns || []);
            var rows = removeAllFromDescriptors(options.rows || []);

            var measures = options.measures || [];
            var measuresRowAxis = options.measuresAxis === "rows";

            if (columns.length) {
                command += serializeMembers(columns, !measuresRowAxis ? measures : []);
            } else if (measures.length && !measuresRowAxis) {
                command += measures.join(",");
            }

            command += "} DIMENSION PROPERTIES CHILDREN_CARDINALITY, PARENT_UNIQUE_NAME ON COLUMNS";

            if (rows.length || (measuresRowAxis && measures.length > 1)) {
                command += ", NON EMPTY {";

                if (rows.length) {
                    command += serializeMembers(rows, measuresRowAxis ? measures : []);
                } else {
                    command += measures.join(",");
                }

                command += "} DIMENSION PROPERTIES CHILDREN_CARDINALITY, PARENT_UNIQUE_NAME ON ROWS";
            }

            if (options.filter) {
                command += " FROM ";
                command += "(SELECT (";
                command += serializeFilters(options.filter);
                command += ") ON 0 FROM [" + options.connection.cube + "])";
            } else {
                command += " FROM [" + options.connection.cube + "]";
            }

            if (measures.length == 1 && columns.length) {
                command += " WHERE (" + measures.join(",") + ")";
            }

            command += '</Statement></Command><Properties><PropertyList><Catalog>' + options.connection.catalog + '</Catalog></PropertyList></Properties></Execute></Body></Envelope>';
            return command.replace(/\&/g, "&amp;");
        }
    };

    var XmlaTransport = kendo.data.RemoteTransport.extend({
        setup: function(options, type) {
            $.extend(true, options.data, { connection: this.options.connection });

            return kendo.data.RemoteTransport.fn.setup.call(this, options, type);
        },
        options: {
            parameterMap: function(options, type) {
                return convertersMap[type](options,type);
            }
        }
    });

    function asArray(object) {
        if (object == null) {
            return [];
        }

        var type = toString.call(object);
        if (type !== "[object Array]") {
            return [object];
        }

        return object;
    }

    function translateAxis(axis) {
        var result = { tuples: [] };
        var tuples = asArray(kendo.getter("Tuples.Tuple", true)(axis));
        var captionGetter = kendo.getter("Caption['#text']");
        var unameGetter = kendo.getter("UName['#text']");
        var levelNameGetter = kendo.getter("LName['#text']");
        var levelNumGetter = kendo.getter("LNum['#text']");
        var childrenGetter = kendo.getter("CHILDREN_CARDINALITY['#text']", true);
        var hierarchyGetter = kendo.getter("['@Hierarchy']");
        var parentNameGetter = kendo.getter("PARENT_UNIQUE_NAME['#text']", true);

        for (var idx = 0; idx < tuples.length; idx++) {
            var members = [];
            var member = asArray(tuples[idx].Member);
            for (var memberIdx = 0; memberIdx < member.length; memberIdx++) {
                members.push({
                    children: [],
                    caption: captionGetter(member[memberIdx]),
                    name: unameGetter(member[memberIdx]),
                    levelName: levelNameGetter(member[memberIdx]),
                    levelNum: levelNumGetter(member[memberIdx]),
                    hasChildren: parseInt(childrenGetter(member[memberIdx]), 10) > 0,
                    parentName: parentNameGetter(member[memberIdx]),
                    hierarchy: hierarchyGetter(member[memberIdx])
                });
            }

            result.tuples.push({ members: members });
        }
        return result;
    }

    var XmlaDataReader = kendo.data.XmlDataReader.extend({
        parse: function(xml) {
            var result = kendo.data.XmlDataReader.fn.parse(xml);
            return kendo.getter("['soap:Envelope']['soap:Body']", true)(result);
        },
        errors: function(root) {
            var fault = kendo.getter("['soap:Fault']", true)(root);
            if (fault) {
                return [{
                    faultstring: kendo.getter("faultstring['#text']", true)(fault),
                    faultcode: kendo.getter("faultcode['#text']", true)(fault)
                }];
            }
            return null;
        },
        axes: function(root) {
            root = kendo.getter("ExecuteResponse.return.root", true)(root);

            var axes = kendo.getter("Axes.Axis", true)(root);
            var columns = translateAxis(axes[0]);
            var rows = {};

            if (axes.length > 2) {
                rows = translateAxis(axes[1]);
            }

            return {
                columns: columns,
                rows: rows
            };
        },
        data: function(root) {
            root = kendo.getter("ExecuteResponse.return.root", true)(root);

            var cells = asArray(kendo.getter("CellData.Cell", true)(root));

            var result = [];
            var ordinalGetter = kendo.getter("['@CellOrdinal']");
            var valueGetter = kendo.getter("Value['#text']");
            var fmtValueGetter = kendo.getter("FmtValue['#text']");

            for (var idx = 0; idx < cells.length; idx++) {
                result.push({
                    value: valueGetter(cells[idx]),
                    fmtValue: fmtValueGetter(cells[idx]),
                    ordinal: parseInt(ordinalGetter(cells[idx]), 10)
                });
            }

            return result;
        }
    });

    extend(true, kendo.data, {
       PivotDataSource: PivotDataSource,
       XmlaTransport: XmlaTransport,
       XmlaDataReader: XmlaDataReader,
       transports: {
           xmla: XmlaTransport
       },
       readers: {
           xmla: XmlaDataReader
       }
    });

    var PivotGrid = Widget.extend({
        init: function(element, options) {
            var that = this;

            Widget.fn.init.call(that, element, options);

            that._wrapper();
            that._createLayout();

            that._columnBuilder = new ColumnBuilder();

            that._dataSource();

            if (that.options.autoBind) {
                that.dataSource.fetch();
            }

            kendo.notify(that);
        },

        events: [],

        options: {
            name: "PivotGrid",
            autoBind: true,
            messages: {
                filterFields: "Drop Filter Fields Here",
                measureFields: "Drop Data Fields Here",
                columnFields: "Drop Column Fields Here",
                rowFields: "Drop Rows Fields Here"
            }
        },

        setDataSource: function() {
            //
        },

        _dataSource: function() {
            var dataSource = this.options.dataSource;

            dataSource = $.isArray(dataSource) ? { data: dataSource } : dataSource;

            if (this.dataSource && this._refreshHandler) {
                this.dataSource.unbind("change", this._refreshHandler);
            } else {
                this._refreshHandler = $.proxy(this.refresh, this);
            }

            this.dataSource = kendo.data.PivotDataSource.create(dataSource)
                .bind("change", this._refreshHandler);
        },

        _wrapper: function() {
            this.wrapper = this.element.addClass("k-widget k-pivot");
        },

        _filterFields: function() {
            var element = $(DIV).addClass("k-pivot-toolbar k-header")
                                .text(this.options.messages.filterFields);

            this.filterFields = element;
        },

        _measureFields: function() {
            this.measureFields = $(DIV).addClass("k-pivot-toolbar k-header")
                                       .text(this.options.messages.measureFields);
        },

        _columnFields: function() {
            this.columnFields = $(DIV).addClass("k-pivot-toolbar k-header")
                                      .text(this.options.messages.columnFields);
        },

        _rowFields: function() {
            this.rowFields = $(DIV).addClass("k-pivot-toolbar k-header")
                                   .text(this.options.messages.rowFields);
        },

        _columnsHeader: function() {
            this.columnsHeader = $('<div class="k-grid-header" />')
                                    .append('<div class="k-grid-header-wrap" />');
        },

        _rowsHeader: function() {
            this.rowsHeader = $('<div class="k-grid k-widget k-alt"/>');
        },

        _contentTable: function() {
            this.content = $('<div class="k-grid-content" />');
        },

        _createLayout: function() {
            var that = this;
            var layoutTable = $(LAYOUT_TABLE);
            var leftContainer = layoutTable.find(".k-pivot-rowheaders");
            var rightContainer = layoutTable.find(".k-pivot-table");
            var gridWrapper = $(DIV).addClass("k-grid k-widget");

            that._filterFields();

            that._measureFields();
            that._columnFields();

            that._rowFields();
            that._columnsHeader();

            that._rowsHeader();
            that._contentTable();

            leftContainer.append(that.measureFields);
            leftContainer.append(that.rowFields);
            leftContainer.append(that.rowsHeader);

            gridWrapper.append(that.columnsHeader);
            gridWrapper.append(that.content);

            rightContainer.append(that.columnFields);
            rightContainer.append(gridWrapper);

            that.wrapper.append(that.filterFields);
            that.wrapper.append(layoutTable);

            //VIRTUAL DOM
            that.columnsHeaderTree = new kendo.dom.Tree(that.columnsHeader[0].firstChild);
            that.rowsHeaderTree = new kendo.dom.Tree(that.rowsHeader[0]);
            that.contentTree = new kendo.dom.Tree(that.content[0]);
        },

        refresh: function() {
            var that = this;
            var dataSource = that.dataSource;

            var axes = dataSource.axes();
            var columns = axes.columns || {};
            var tuples = columns.tuples || [];
            var rows = axes.rows || {};

            var data = dataSource.view();

            var columnsTree = that._columnBuilder.build(tuples || []);
            var rowsTree = kendo_row_headers(rows.tuples || []);

            that.columnsHeaderTree.render(columnsTree);
            that.rowsHeaderTree.render(rowsTree);
            that.contentTree.render(kendo_content(data, columnsTree, rowsTree));
        }
    });

    var element = kendo.dom.element;
    var text = kendo.dom.text;

    var ColumnBuilder = Class.extend({
        init: function(options) {
            this._state(null);
        },

        build: function(tuples) {
            return [
                element("table", null, [this._thead(tuples)])
            ];
        },

        _cell: function(member, attr) {
            return element("th", attr, [text(member.caption || member.name)]);
        },

        _memberIndex: function(members, parentMember) {
            var index = 0;
            var member = members[index];

            while(member && member.parentName !== parentMember.name) {
                index += 1;
                member = members[index];
            }

            return member ? index : index - 1;
        },

        _normalizeRows: function() {
            this._normalizeRowSpan();
            this._normalizeColSpan();
        },

        _normalizeRowSpan: function() {
            var rows = this.rows;
            var rowsLength = rows.length;
            var rowIdx = 0;
            var row;

            var cellsLength;
            var cellIdx;
            var cells;
            var cell;
            var attrName = kendo.attr("tuple-all");

            for (; rowIdx < rowsLength; rowIdx++) {
                row = rows[rowIdx];

                if (row.rowspan === 1) {
                    continue;
                }

                cells = row.children;

                cellIdx = 0;
                cellsLength = cells.length;

                for (; cellIdx < cellsLength; cellIdx++) {
                    cell = cells[cellIdx];

                    if (cell.attr[attrName]) {
                        cell.attr.rowspan = row.rowspan;
                    }
                }
            }
        },

        _normalizeColSpan: function() {
            var rootMembers = this.rootTuple.members;
            var idx = rootMembers.length - 1;
            var member = rootMembers[idx];

            var map = this.map;
            var row = map[member.name + member.levelNum];
            var colspan = this._rootRowColSpan(row);
            var currentColspan;

            while(idx) {
                idx -= 1;
                member = rootMembers[idx];
                row = map[member.name + member.levelNum];

                if (colspan > 1) {
                    row.children[row.children.length - 1].attr.colspan = colspan;
                }

                colspan = this._rootRowColSpan(row);
            }
        },

        _rootRowColSpan: function (row) {
            var children = row.children;
            var lastIdx = children.length - 1;
            var cell = children[lastIdx];
            var colspan = cell.attr.colspan || 1;

            if (cell.attr.rowspan > 1) {
                colspan += children[lastIdx - 1].attr.colspan;
            }

            return colspan;
        },

        _rowIndex: function(row) {
            var rows = this.rows;
            var length = rows.length;
            var idx = 0;

            for(; idx < length; idx++) {
                if (rows[idx] === row) {
                    break;
                }
            }

            return idx;
        },

        _row: function(tuple, memberIndex, parentMember) {
            var rootName = this.rootTuple.members[memberIndex].name;
            var levelNum = tuple.members[memberIndex].levelNum;
            var rowKey = rootName + levelNum;
            var map = this.map;
            var parentRow;

            row = map[rowKey];

            if (!row) {
                row = element("tr", null, []);

                row.parentMember = parentMember;
                row.colspan = 0;
                row.rowspan = 1;

                map[rowKey] = row;
                parentRow = map[rootName + (Number(levelNum) - 1)];

                this.rows.splice(this._rowIndex(parentRow) + 1, 0, row);
            }

            if (!row.parentMember || row.parentMember !== parentMember) {
                row.parentMember = parentMember;
                row.colspan = 0;
            }

            return row;
        },

        _buildRows: function(tuple, memberIndex, parentMember) {
            var members = tuple.members;
            var children;
            var childRow;
            var member;
            var row;

            var allCell;
            var cell;

            var idx = 0;
            var childrenLength;

            var colspan;

            if (parentMember) {
                memberIndex = this._memberIndex(members, parentMember);
            }

            row = this._row(tuple, memberIndex, parentMember);

            member = members[memberIndex];

            cell = this._cell(member, { class: "k-header" });
            row.children.push(cell);
            row.colspan += 1;

            children = member.children;
            childrenLength = children.length

            if (childrenLength) {
                allCell = this._cell(member, { class: "k-header k-alt" });
                row.children.push(allCell);

                for (; idx < childrenLength; idx++) {
                    childRow = this._buildRows(children[idx], 0, member);
                }

                if (row.children[0] !== cell) {
                    childRow.children[childRow.children.length - childRow.colspan].attr.class += " k-first";
                }

                colspan = childRow.colspan;
                cell.attr.colspan = colspan;

                row.colspan += colspan;
                row.rowspan = childRow.rowspan + 1;

                if (members[memberIndex + 1]) {
                    var newRow = this._buildRows(tuple, ++memberIndex);

                    allCell.attr.colspan = newRow.colspan;
                    row.colspan += newRow.colspan - 1;
                }
            } else if (members[memberIndex + 1]) {
                childRow = this._buildRows(tuple, ++memberIndex);

                if (childRow.colspan > 1) {
                    cell.attr.colspan = childRow.colspan;
                    row.colspan += childRow.colspan - 1;
                }
            }

            (allCell || cell).attr[kendo.attr("tuple-all")] = true;

            return row;
        },

        _state: function(rootTuple) {
            this.rows = [];
            this.map = {};
            this.rootTuple = rootTuple;
        },

        _thead: function(tuples) {
            var root = tuples[0];

            this._state(root);

            if (root) {
                this._buildRows(root, 0);
                this._normalizeRows();
            } else {
                this.rows.push(element("tr", null, kendo_th("")));
            }

            return element("thead", null, this.rows);
        }
    });

    //row headers
    function kendo_th(member, attr) {
        return element("th", attr, [text(member.caption || member.name)]);
    }

    function kendo_row_headers(rows) {
        return [ element("table", null, [kendo_row_thead(rows)]) ];
    }

    function kendo_row_thead(rows) {
        return element("thead", null, kendo_row_thead_rows(rows));
    }

    function kendo_row_thead_rows(rows) {
        var elements = [];
        var length = rows.length || 1;

        for (var j = 0; j < length; j++) {
            var cells = [];

            var tuple = rows[j];
            var member;

            if (tuple) {
                for (var i = 0; i < tuple.members.length; i++) {
                    member = tuple.members[i];

                    cells.push(kendo_th(member));
                }
            } else {
                member = {
                    caption: ""
                };

                cells.push(kendo_th(member));
            }

            elements.push(element("tr", null, cells));
        }

        return elements;
    }

    //content
    function kendo_content(data, columnsTree, rowsTree) {
        return [ element("table", null, [kendo_tbody(data, columnsTree, rowsTree)]) ];
    }

    function kendo_tbody(data, columnsTree, rowsTree) {
        return element("tbody", null, kendo_rows(data, columnsTree, rowsTree));
    }

    function kendo_rows(data, columnsTree, rowsTree) {
        var columnRows = columnsTree[0].children[0].children;

        var columnLastRow = columnRows[columnRows.length - 1];

        var columnsLength = columnLastRow ? columnLastRow.children.length : 1;

        var length = Math.ceil((data.length || 1) / columnsLength);
        var rows = [];

        for (var i = 0; i < length; i++) {
            rows.push(kendo_row(data, i, columnLastRow));
        }
        return rows;
    }

    function kendo_row(data, rowIndex, columnLastRow) {
        //render cells
        var cells = [];

        var columns = columnLastRow ? columnLastRow.children : [];
        var columnsLength = columns.length;

        var start = rowIndex * columnsLength;
        var end = start + columnsLength;
        var dataItem;

        for (; start < end; start++) {
            dataItem = data[start];
            cells.push(element("td", null, [text(dataItem ? dataItem.value : "")]));
        }

        return element("tr", null, cells);
    }

    ui.plugin(PivotGrid);
})(window.kendo.jQuery);

return window.kendo;

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });
