/**
 *  Copyright (C) 2014 3D Repo Ltd
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

class TreeController implements ng.IController {
	
	static $inject: string[] = [
		"$scope", 
		"$timeout", 

		"TreeService", 
		"EventService",
		"MultiSelectService", 
		"ViewerService"
	];

	promise;
	currentSelectedNodes;
	highlightSelectedViewerObject: boolean;
	clickedHidden;
	clickedShown;
	lastParentWithName = null;
	
	nodes;
	allNodes;
	nodesToShow;
	showNodes;
	showTree;
	showFilterList;
	currentFilterItemSelected;
	viewerSelectedObject;
	showProgress;
	progressInfo;
	visible;
	invisible;
	subTreesById;
	idToPath;
	subModelIdToPath;
	filterItemsFound;
	topIndex;
	toggledNode;
	infiniteItemsTree;
	infiniteItemsFilter;
	onContentHeightRequest;
		
	constructor(
		private $scope, 
		private $timeout, 
		private TreeService, 
		private EventService, 
		private MultiSelectService, 
		private ViewerService
	) {
		const vm = this;
		this.promise = null,
		this.currentSelectedNodes = [],
		this.highlightSelectedViewerObject = true,
		this.clickedHidden = {}, // Nodes that have actually been clicked to hide
		this.clickedShown = {}; // Nodes that have actually been clicked to show
	}
	
	/*
	* Init
	*/
	$onInit() {

		this.nodes = [];
		this.showNodes = true;
		this.showTree = true;
		this.showFilterList = false;
		this.currentFilterItemSelected = null;
		this.viewerSelectedObject = null;
		this.showProgress = true;
		this.progressInfo = "Loading full tree structure";
		this.onContentHeightRequest({height: 70}); // To show the loading progress
		this.visible   = {};
		this.invisible = {};
		this.currentSelectedNodes = [];
		this.watchers();

	};

	watchers() {
		this.$scope.$watch(this.EventService.currentEvent, (event) => {
			
			if (event.type === this.EventService.EVENT.VIEWER.OBJECT_SELECTED) {
	
				if ((event.value.source !== "tree") && this.highlightSelectedViewerObject) {
					let objectID = event.value.id;
	
					if (objectID && this.idToPath) {
						let path = this.getPath(objectID);
						if (!path) {
							console.error("Couldn't find the object path");
						} else {
							this.initNodesToShow();
							this.lastParentWithName = null;
							this.expandToSelection(path, 0, undefined);
							//all these init and expanding unselects the selected, so let's select them again
							//FIXME: ugly as hell but this is the easiest solution until we refactor this.
							this.currentSelectedNodes.forEach((selectedNode) => {
								selectedNode.selected = true;
							});
							this.lastParentWithName && this.selectNode(this.lastParentWithName);
						}
					}
				}
	
			} else if (event.type === this.EventService.EVENT.VIEWER.BACKGROUND_SELECTED) {
				this.clearCurrentlySelected();
				if (this.currentFilterItemSelected !== null) {
					this.currentFilterItemSelected.class = "";
					this.currentFilterItemSelected = null;
				}
			} else if  (event.type === this.EventService.EVENT.PANEL_CARD_ADD_MODE ||
						event.type === this.EventService.EVENT.PANEL_CARD_EDIT_MODE
			) {
				// If another card is in modify mode don't show a node if an object is clicked in the viewer
				this.highlightSelectedViewerObject = !event.value.on;
			}  else if (event.type === this.EventService.EVENT.TREE_READY){
				/*
				* Get all the tree nodes
				*/
	
				this.allNodes = [];
				this.allNodes.push(event.value.nodes);
				this.nodes = this.allNodes;
				this.showTree = true;
				this.showProgress = false;
				this.subTreesById = event.value.subTreesById;
				this.idToPath = event.value.idToPath;
				
				this.subModelIdToPath = event.value.subModelIdToPath;
	
				this.initNodesToShow();
				this.expandFirstNode();
				this.setupInfiniteScroll();
				this.setContentHeight(this.nodesToShow);
			}
		});

		this.$scope.$watch("vm.filterText", (newValue) => {
			const noFilterItemsFoundHeight = 82;
	
			if (this.isDefined(newValue)) {
				if (newValue.toString() === "") {
					this.showTree = true;
					this.showFilterList = false;
					this.showProgress = false;
					this.nodes = this.nodesToShow;
					this.setContentHeight(this.nodes);
				} else {
					this.showTree = false;
					this.showFilterList = false;
					this.showProgress = true;
					this.progressInfo = "Filtering tree for objects";
	
					this.TreeService.search(newValue)
						.then((json) => {
							this.showFilterList = true;
							this.showProgress = false;
							this.nodes = json.data;
							if (this.nodes.length > 0) {
								this.filterItemsFound = true;
								for (let i = 0; i < this.nodes.length; i ++) {
									this.nodes[i].index = i;
									this.nodes[i].toggleState = "visible";
									this.nodes[i].class = "unselectedFilterItem";
									this.nodes[i].level = 0;
								}
								this.setupInfiniteItemsFilter();
								this.setContentHeight(this.nodes);
							} else {
								this.filterItemsFound = false;
								this.onContentHeightRequest({height: noFilterItemsFoundHeight});
							}
						});
				}
			}
		});

	}

	/**
	 * Set the content height.
	 * The height of a node is dependent on its name length and its level.
	 *
	 * @param {Array} nodesToShow
	 */
	setContentHeight(nodesToShow) {
		let i, length,
			height = 0,
			nodeMinHeight = 42,
			maxStringLength = 35, maxStringLengthForLevel = 0,
			lineHeight = 18, levelOffset = 2;

		for (i = 0, length = nodesToShow.length; i < length ; i += 1) {
			maxStringLengthForLevel = maxStringLength - (nodesToShow[i].level * levelOffset);
			if (nodesToShow[i].hasOwnProperty("name")) {
				height += nodeMinHeight + (lineHeight * Math.floor(nodesToShow[i].name.length / maxStringLengthForLevel));
			} else {
				height += nodeMinHeight + lineHeight;
			}
		}
		this.onContentHeightRequest({height: height});
	}

	/**
	 * Initialise the tree nodes to show to the first node
	 */
	initNodesToShow() {
		this.nodesToShow = [this.allNodes[0]];
		this.nodesToShow[0].level = 0;
		this.nodesToShow[0].expanded = false;
		this.nodesToShow[0].selected = false;
		this.nodesToShow[0].hasChildren = this.nodesToShow[0].children;

		// Only make the top node visible if it does not have a toggleState
		if (!this.nodesToShow[0].hasOwnProperty("toggleState")) {
			this.nodesToShow[0].toggleState = "visible";
		}
	}

	/**
	 * Show the first set of children using the expand function but deselect the child used for this
	 */
	expandFirstNode () {
		this.expandToSelection(this.nodesToShow[0].children[0].path.split("__"), 0, true);
		this.nodesToShow[0].children[0].selected = false;
	}

	/**
	 * traverse children of a node recursively
	 * @param {Object} node
	 * @param {Function} callback
	 */
	traverseNode(node, callback){
		callback(node);
		node.children && node.children.forEach((child) => {
			this.traverseNode(child, callback);
		});
	}

	getAccountModelKey(account, model) {
		return account + "@" + model;
	}

	/**
	 * Add all child id of a node recursively, the parent node's id will also be added.
	 * @param {Object} node
	 * @param {Array} nodes Array to push the nodes to
	 */
	traverseNodeAndPushId(node, nodes){
		this.traverseNode(node, (node) => {
			if (!node.children && ((node.type || "mesh") === "mesh")) {
				let key = this.getAccountModelKey(node.account, node.project);
				if(!nodes[key]){
					nodes[key] = [];
				}

				nodes[key].push(node._id);
			}
		});
	}

	getVisibleArray(account, model){
		let key = this.getAccountModelKey(account, model);
		if(!this.visible[key]){
			this.visible[key] = new Set();
		}

		return this.visible[key];
	}

	getInvisibleArray(account, model){
		let key = this.getAccountModelKey(account, model);
		if(!this.invisible[key]){
			this.invisible[key] = new Set();
		}

		return this.invisible[key];
	}

	/**
	 * Set the toggle state of a node
	 * @param {Object} node Node to change the visibility for
	 * @param {String} visibility Visibility to change to
	 */
	setToggleState(node, visibility) {
		let visible = this.getVisibleArray(node.account, node.project);
		let invisible = this.getInvisibleArray(node.account, node.project);

		if (!node.children && ((node.type || "mesh") === "mesh")) {
			if (visibility === "invisible") {
				if (invisible.has(node._id)) {
					invisible.delete(node._id);
				} else {
					invisible.add(node._id);
				}

				visible.delete(node._id);
			} else {
				if (visible.has(node._id)) {
					visible.delete(node._id);
				} else {
					visible.add(node._id);
				}

				invisible.delete(node._id);
			}
		}

		node.toggleState = visibility;
	};

	/*
	* See if id in each ids is a sub string of path
	*/
	matchPath(ids, path) {

		for(let i=0; i<ids.length; i++){
			if(path.indexOf(ids[i]) !== -1){
				return true;
			}
		}

		return false;
	}

	isDefined(value) {
		return value !== undefined && value !== null;
	}

	/**
	 * Expand a node to show its children.
	 * @param event
	 * @param _id
	 */
	expand(event, _id) {
		let i, length,
			j, jLength,
			numChildren = 0,
			index = -1,
			endOfSplice = false,
			numChildrenToForceRedraw = 3;

		event.stopPropagation();

		// Find node index
		for (i = 0, length = this.nodesToShow.length; i < length; i += 1) {
			if (this.nodesToShow[i]._id === _id) {
				index = i;
				break;
			}
		}
		let _ids = [_id];
		// Found
		if (index !== -1) {
			if (this.nodesToShow[index].hasChildren) {
				if (this.nodesToShow[index].expanded) {
					// Collapse

					//if the target itself contains subModelTree
					if(this.nodesToShow[index].hasSubModelTree){
						//node containing sub model tree must have only one child
						let subModelNode = this.subTreesById[this.nodesToShow[index].children[0]._id];
						_ids.push(subModelNode._id);
					}

					while (!endOfSplice) {

						if (this.isDefined(this.nodesToShow[index + 1]) && this.matchPath(_ids, this.nodesToShow[index + 1].path)) {

							if(this.nodesToShow[index + 1].hasSubModelTree){
								let subModelNode = this.subTreesById[this.nodesToShow[index + 1].children[0]._id];
								_ids.push(subModelNode._id);
							}

							this.nodesToShow.splice(index + 1, 1);

						} else {
							endOfSplice = true;
						}
					}
				} else {
					// Expand
					numChildren = this.nodesToShow[index].children.length;

					// If the node has a large number of children then force a redraw of the tree to get round the display problem
					if (numChildren >= numChildrenToForceRedraw) {
						this.showNodes = false;
					}

					for (i = 0; i < numChildren; i += 1) {
						// For federation - handle node of model that cannot be viewed or has been deleted
						// That node will be below level 0 only
						if ((this.nodesToShow[index].level === 0) &&
							this.nodesToShow[index].children[i].hasOwnProperty("children") &&
							this.nodesToShow[index].children[i].children[0].hasOwnProperty("status")) {

							this.nodesToShow[index].children[i].status = this.nodesToShow[index].children[i].children[0].status;

						} else {
							// Normal tree node
							this.nodesToShow[index].children[i].expanded = false;

							// If the child node does not have a toggleState set it to visible
							if (!this.nodesToShow[index].children[i].hasOwnProperty("toggleState")) {
								this.setToggleState(this.nodesToShow[index].children[i], "visible");
							}

						}

						// A child node only "hasChildren", i.e. expandable, if any of it's children have a name
						this.nodesToShow[index].children[i].level = this.nodesToShow[index].level + 1;
						this.nodesToShow[index].children[i].hasChildren = false;
						if (("children" in this.nodesToShow[index].children[i]) && (this.nodesToShow[index].children[i].children.length > 0)) {
							for (j = 0, jLength = this.nodesToShow[index].children[i].children.length; j < jLength; j++) {
								if (this.nodesToShow[index].children[i].children[j].hasOwnProperty("name")) {
									this.nodesToShow[index].children[i].hasChildren = true;
									break;
								}
							}
						}

						if(this.nodesToShow[index].children[i].hasOwnProperty("name")){
							this.nodesToShow.splice(index + i + 1, 0, this.nodesToShow[index].children[i]);
						}
						
					}

					// Redraw the tree if needed
					if (!this.showNodes) {
						this.$timeout(() => {
							this.showNodes = true;
							// Resize virtual repeater
							// Taken from kseamon's comment - https://github.com/angular/material/issues/4314
							this.$scope.$broadcast("$md-resize");
						});
					}
				}
				this.nodesToShow[index].expanded = !this.nodesToShow[index].expanded;
			}
		}

		this.setContentHeight(this.nodesToShow);
	};

	/**
	 * Expand the tree and highlight the node corresponding to the object selected in the viewer.
	 * @param path
	 * @param level
	 */



	expandToSelection(path, level, noHighlight) {
		let i, j, length, childrenLength, selectedId = path[path.length - 1], selectedIndex = 0, selectionFound = false;

		// Force a redraw of the tree to get round the display problem
		this.showNodes = false;
		let condLoop = true;
		for (i = 0, length = this.nodesToShow.length; i < length && condLoop; i += 1) {
			if (this.nodesToShow[i]._id === path[level]) {

				this.lastParentWithName = this.nodesToShow[i];

				this.nodesToShow[i].expanded = true;
				this.nodesToShow[i].selected = false;
				childrenLength = this.nodesToShow[i].children.length;

				if (level === (path.length - 2)) {
					selectedIndex = i;
				}

				let childWithNameCount = 0;

				for (j = 0; j < childrenLength; j += 1) {
					// Set child to not expanded
					this.nodesToShow[i].children[j].expanded = false;

					if (this.nodesToShow[i].children[j]._id === selectedId) {

						if (this.nodesToShow[i].children[j].hasOwnProperty("name")) {
							this.nodesToShow[i].children[j].selected = true;
							if(!noHighlight) {
								this.selectNode(this.nodesToShow[i].children[j]);
							}
							this.lastParentWithName = null;
							selectedIndex = i + j + 1;

						} else if(!noHighlight){
							// If the selected mesh doesn't have a name highlight the parent in the tree
							// highlight the parent in the viewer

							this.selectNode(this.nodesToShow[i]);
							selectedId = this.nodesToShow[i]._id;
							selectedIndex = i;
							this.lastParentWithName = null;
							selectedId = this.nodesToShow[i]._id;
						}

						condLoop = false;
					} else {
						// This will clear any previously selected node
						this.nodesToShow[i].children[j].selected = false;
					}

					// Only set the toggle state once when the node is listed
					if (!this.nodesToShow[i].children[j].hasOwnProperty("toggleState")) {
						this.setToggleState(this.nodesToShow[i].children[j], "visible");
					}

					// Determine if child node has childern
					this.nodesToShow[i].children[j].hasChildren = false;
					if (("children" in this.nodesToShow[i].children[j]) && (this.nodesToShow[i].children[j].children.length > 0)) {
						for (let k = 0, jLength = this.nodesToShow[i].children[j].children.length; k < jLength; k++) {
							if (this.nodesToShow[i].children[j].children[k].hasOwnProperty("name")) {
								this.nodesToShow[i].children[j].hasChildren = true;
								break;
							}
						}
					}

					// Set current selected node
					if (this.nodesToShow[i].children[j].selected) {
						selectionFound = true;

					}


					this.nodesToShow[i].children[j].level = level + 1;

					if(this.nodesToShow[i].hasChildren && this.nodesToShow[i].children[j].hasOwnProperty("name")){

						this.nodesToShow.splice(i + childWithNameCount + 1, 0, this.nodesToShow[i].children[j]);
						childWithNameCount++;
					}
					
				}
			}
		}
		if (level < (path.length - 2)) {
			this.expandToSelection(path, (level + 1), undefined);
		} else if (level === (path.length - 2)) {
			this.setContentHeight(this.nodesToShow);
			this.showNodes = true;
			this.$timeout(() => {
				// Redraw the tree

				// Resize virtual repeater

				// Taken from kseamon's comment - https://github.com/angular/material/issues/4314
				this.$scope.$broadcast("$md-resize");
				this.topIndex = selectedIndex;
			});

			this.$timeout(() => {
				let el = document.getElementById(selectedId);
				el && el.scrollIntoView();
			});

		}
	}

	getPath(objectID) {
		
		let path;
		if(this.idToPath[objectID]){
			// If the Object ID is on the main tree then use that path
			path = this.idToPath[objectID].split("__");
		} else if (this.subModelIdToPath[objectID]) {
			// Else check the submodel for the id for the path
			path = this.subModelIdToPath[objectID].split("__");
			let parentPath = this.subTreesById[path[0]].parent.path.split("__");
			path = parentPath.concat(path);
		}

		return path;

	};

	toggleTreeNode(node) {
		let nodesLength,
			path,
			hasParent,
			lastParent = node,
			nodeToggleState = "visible",
			numInvisible = 0,
			numParentInvisible = 0;

		this.toggledNode = node;

		//toggle yourself
		this.setToggleState(node, (node.toggleState === "visible") ? "invisible" : "visible");
		nodeToggleState = node.toggleState;
		this.updateClickedHidden(node);
		this.updateClickedShown(node);

		let stack = [node];
		let head = null;

		while (stack.length > 0) {
			head = stack.pop();

			if (node !== head) {
				this.setToggleState(head, nodeToggleState);
			}

			if (head.children) {
				for(let i = 0; i < head.children.length; i++) {
					stack.push(head.children[i]);
				}
			}
		}

		//a__b .. c__d
		//toggle parent
		path = node.path.split("__");
		path.splice(path.length - 1, 1);

		for (let i = 0, nodesLength = this.nodesToShow.length; i < nodesLength; i += 1) {
		// 	// Get node parent
			if (this.nodesToShow[i]._id === path[path.length - 1]) {

				lastParent = this.nodesToShow[i];
				hasParent = true;

			} else if(lastParent.parent){

				//Get node parent and reconstruct the path in case it is a fed model
				lastParent = lastParent.parent;
				path = lastParent.path.split("__").concat(path);
				hasParent = true;
			}
		}

		// Set the toggle state of the nodes above
		if (hasParent) {
			for (let i = (path.length - 1); i >= 0; i -= 1) {
				for (let j = 0, nodesLength = this.nodesToShow.length; j < nodesLength; j += 1) {
					if (this.nodesToShow[j]._id === path[i]) {
						numInvisible = this.nodesToShow[j].children.reduce(
							function (total, child) {
								return child.toggleState === "invisible" ? total + 1 : total;
							},
							0);
						numParentInvisible = this.nodesToShow[j].children.reduce(
							function (total, child) {
								return child.toggleState === "parentOfInvisible" ? total + 1 : total;
							},
							0);

						if (numInvisible === this.nodesToShow[j].children.length) {
							this.nodesToShow[j].toggleState = "invisible";
						} else if ((numParentInvisible + numInvisible) > 0) {
							this.nodesToShow[j].toggleState = "parentOfInvisible";
						} else {
							this.setToggleState(this.nodesToShow[j], "visible");
						}
					}
				}
			}
		}

		this.toggleNode(node);
	};

	toggleNode(node) {
		let childNodes = [];

		this.traverseNodeAndPushId(node, childNodes);
		
		for (let key in childNodes){

			let vals = key.split("@");
			let account = vals[0];
			let model = vals[1];
			this.ViewerService.switchObjectVisibility(account, model, childNodes[key], node.toggleState != "invisible");
		}

	};

	setupInfiniteScroll() {
		// Infinite items
		this.infiniteItemsTree = {
			numLoaded_: 0,
			toLoad_: 0,

			getItemAtIndex: function (index) {
				if (index > this.numLoaded_) {
					this.fetchMoreItems_(index);
					return null;
				}

				if (index < this.nodesToShow.length) {
					return this.nodesToShow[index];
				} else {
					return null;
				}
			},

			getLength: function () {
				return this.numLoaded_ + 5;
			},

			fetchMoreItems_: function (index) {
				if (this.toLoad_ < index) {
					this.toLoad_ += 500;
					this.$timeout(function() {}, 300).then(() => {
						this.numLoaded_ = this.toLoad_;
					});
				}
			}
		};
	}

	/**
	 * Unselect all selected items and clear the array
	 */
	clearCurrentlySelected(){
		this.currentSelectedNodes.forEach((selectedNode) => {
			selectedNode.selected = false;
		});
		this.currentSelectedNodes = [];
	}
	/**
	 * Selected a node in the tree
	 *
	 * @param node
	 */
	selectNode(node) {

		let sameNodeIndex = this.currentSelectedNodes.findIndex((element) => {
			return element._id === node._id;
		});

		if(this.MultiSelectService.isMultiMode()) {
			if(sameNodeIndex > -1)
			{
				//Multiselect mode and we selected the same node - unselect it
				this.currentSelectedNodes[sameNodeIndex].selected = false;
				this.currentSelectedNodes.splice(sameNodeIndex, 1);				
			}
			else{
				node.selected = true;
				this.currentSelectedNodes.push(node);
			}
		}
		else{
			//If it is not multiselect mode, remove all highlights.
			this.ViewerService.clearHighlights();
			this.clearCurrentlySelected();
			node.selected = true;
			this.currentSelectedNodes.push(node);
		}

		let map = [];

		this.traverseNodeAndPushId(node, map);

		// Select the parent node in the group for cards and viewer
		this.EventService.send(this.EventService.EVENT.VIEWER.OBJECT_SELECTED, {
			source: "tree",
			account: node.account,
			model: node.project,
			id: node._id,
			name: node.name,
			noHighlight : true
		});

		for(let key in map) {
			let vals = key.split("@");
			let account = vals[0];
			let model = vals[1];
		
			// Separately highlight the children
			// but only for multipart meshes
			this.ViewerService.highlightObjects({
				source: "tree",
				account: account,
				model: model,
				ids: map[key],
				multi: true
			});
		}
	};

	filterItemSelected(item) {
		if (this.currentFilterItemSelected === null) {
			this.nodes[item.index].class = "treeNodeSelected";
			this.currentFilterItemSelected = item;
		} else if (item.index === this.currentFilterItemSelected.index) {
			this.nodes[item.index].class = "";
			this.currentFilterItemSelected = null;
		} else {
			this.nodes[this.currentFilterItemSelected.index].class = "";
			this.nodes[item.index].class = "treeNodeSelected";
			this.currentFilterItemSelected = item;
		}

		let selectedNode = this.nodes[item.index];

		this.selectNode(selectedNode);
	};

	toggleFilterNode(item) {
		this.setToggleState(item, (item.toggleState === "visible") ? "invisible" : "visible");
		item.path = item._id;
		this.toggleNode(item);
	};

	setupInfiniteItemsFilter() {
		this.infiniteItemsFilter = {
			numLoaded_: 0,
			toLoad_: 0,
			getItemAtIndex: function (index) {
				if (index > this.numLoaded_) {
					this.fetchMoreItems_(index);
					return null;
				}

				if (index < this.nodes.length) {
					return this.nodes[index];
				} else {
					return null;
				}
			},
			getLength: function () {
				return this.numLoaded_ + 5;
			},
			fetchMoreItems_: function (index) {
				if (this.toLoad_ < index) {
					this.toLoad_ += 20;
					this.$timeout(() => {}, 300).then(() => {
						this.numLoaded_ = this.toLoad_;
					});
				}
			}
		};
	}

	/**
	 * If a node was clicked to hide, add it to a list of similar nodes
	 *
	 * @param {Object} node
	 */
	updateClickedHidden (node) {
		if (node.toggleState === "invisible") {
			this.clickedHidden[node._id] = node;
		} else {
			delete this.clickedHidden[node._id];
		}
	}

	/**
	 * If a node was clicked to show, add it to a list of similar nodes
	 *
	 * @param {Object} node
	 */
	updateClickedShown (node) {
		if (node.toggleState === "visible") {
			this.clickedShown[node._id] = node;
		} else {
			delete this.clickedShown[node._id];
		}
	}

}

export const TreeComponent: ng.IComponentOptions = {
	templateUrl: "templates/tree.html",
	bindings: {
		account:  "=",
		model:  "=",
		branch:   "=",
		revision: "=",
		filterText: "=",
		onContentHeightRequest: "&"
	},
	controller: TreeController,
	controllerAs: "vm"
}

export const TreeComponentModule = angular
	.module('3drepo')
	.component('tree', TreeComponent);
