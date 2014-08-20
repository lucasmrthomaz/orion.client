/*global parent window document define orion setTimeout*/
	
var uiTestFunc = null;

define(["orion/bootstrap", "orion/xhr", 'orion/webui/littlelib', 'orion/Deferred', 'orion/cfui/cFClient', 'orion/PageUtil', 'orion/selection',
	'orion/URITemplate', 'orion/PageLinks', 'orion/preferences', 'cfui/cfUtil', 'orion/objects'], 
		function(mBootstrap, xhr, lib, Deferred, CFClient, PageUtil, mSelection, URITemplate, PageLinks, Preferences, mCfUtil, objects) {

	var cloudManageUrl;
	
	mBootstrap.startup().then(
		function(core) {
			
			var pageParams = PageUtil.matchResourceParameters();
			var deployResource = decodeURIComponent(pageParams.resource);
			
			var serviceRegistry = core.serviceRegistry;
			var cFService = new CFClient.CFService(serviceRegistry);
			
			// initial message
			document.getElementById('title').appendChild(document.createTextNode("Configure Application Deployment")); //$NON-NLS-1$//$NON-NLS-0$
			var msgContainer = document.getElementById('messageContainer'); //$NON-NLS-0$
			var msgLabel = document.getElementById('messageLabel'); //$NON-NLS-0$
			var msgNode;
			var okButton = document.getElementById('okbutton'); //$NON-NLS-0$
			var page1 = document.getElementById('page1'); //$NON-NLS-0$
			var page2 = document.getElementById('page2'); //$NON-NLS-0$
			var orgsDropdown;
			var spacesDropdown;
			var appsInput;
			var appsDropdown;
			var hostInput;
			var hostDropdown;
			var saveManifestCheckbox;
			var deployResourceJSON = JSON.parse(deployResource);
			var relativeFilePath = new URL(deployResourceJSON.ContentLocation).href;
			var orionHomeUrl = new URL(PageLinks.getOrionHome());
			if(relativeFilePath.indexOf(orionHomeUrl.origin) === 0){
				relativeFilePath = relativeFilePath.substring(orionHomeUrl.origin.length);
			}
			if(relativeFilePath.indexOf(orionHomeUrl.pathname) === 0){
				relativeFilePath = relativeFilePath.substring(orionHomeUrl.pathname.length);
			}
			var manifestContents = {applications: [{}]};
			var manifestInfo = {};

			function showMessage(message){
				msgLabel.appendChild(document.createTextNode(message));
				msgContainer.classList.add("showing"); //$NON-NLS-0$
			}
			
			function hideMessage(){
				lib.empty(msgLabel);
				msgContainer.classList.remove("showing"); //$NON-NLS-0$
			}
			
			var selection;
			
			function setValid(valid){
				if(valid){
					okButton.classList.remove("disabled");
				} else {
					okButton.classList.add("disabled");
				}
				okButton.disabled = !valid;
			}
						
			var validate = function() {
				if(!selection){
					setValid(false);
					return;					
				}
				selection.getSelection(function(selection) {
					if(selection===null || selection.length===0){
						setValid(false);
						return;
					}
					setValid(true);
				});
			};
			
			showMessage("Loading deployment settings...");
			validate();
			
			
			// register hacked pref service
			
			var temp = document.createElement('a');
			temp.href = "../prefs/user";
			var location = temp.href;
			
			function PreferencesProvider(location) {
				this.location = location;
			}

			PreferencesProvider.prototype = {
				get: function(name) {
					return xhr("GET", this.location + name, {
						headers: {
							"Orion-Version": "1"
						},
						timeout: 15000,
						log: false
					}).then(function(result) {
						return result.response ? JSON.parse(result.response) : null;
					});
				},
				put: function(name, data) {
					return xhr("PUT", this.location + name, {
						data: JSON.stringify(data),
						headers: {
							"Orion-Version": "1"
						},
						contentType: "application/json;charset=UTF-8",
						timeout: 15000
					}).then(function(result) {
						return result.response ? JSON.parse(result.response) : null;
					});
				},
				remove: function(name, key){
					return xhr("DELETE", this.location + name +"?key=" + key, {
						headers: {
							"Orion-Version": "1"
						},
						contentType: "application/json;charset=UTF-8",
						timeout: 15000
					}).then(function(result) {
						return result.response ? JSON.parse(result.response) : null;
					});
				}
			};
			
			var service = new PreferencesProvider(location);
			serviceRegistry.registerService("orion.core.preference.provider", service, {});
			
			// This is code to ensure the first visit to orion works
			// we read settings and wait for the plugin registry to fully startup before continuing
			var preferences = new Preferences.PreferencesService(serviceRegistry);
			
			// cancel button
			var closeFrame = function() {
				 window.parent.postMessage(JSON.stringify({pageService: "orion.page.delegatedUI", 
					 source: "org.eclipse.orion.client.cf.deploy.uritemplate", cancelled: true}), "*");
			};
			
			var getManifestInfo = function(){
				var ret = objects.clone(manifestContents);
				if(!manifestContents.applications.length>0){
					manifestContents.applications.push({});
				}
				if(appsInput && appsInput.value){
					manifestContents.applications[0].name = appsInput.value;
				}
				if(hostInput && hostInput.value){
					manifestContents.applications[0].host = hostInput.value;
				}
				return ret;
			};
			
			var doAction = function() {
				showMessage("Deploying...");
				setValid(false);
				selection.getSelection(
					function(selection) {
						if(selection===null || selection.length===0){
							closeFrame();
							return;
						}
						
						if(orgsDropdown){
							orgsDropdown.disabled = true;
						}
						if(spacesDropdown){
							spacesDropdown.disabled = true;
						}
						
						var editLocation = new URL("../edit/edit.html#" + deployResourceJSON.ContentLocation, window.location.href);
						
						var manifest = getManifestInfo();
						
						cFService.pushApp(selection, null, decodeURIComponent(deployResourceJSON.ContentLocation + deployResourceJSON.AppPath), manifest, saveManifestCheckbox.checked).then(
							function(result){
								var appName = result.App.name || result.App.entity.name;
								var host = (result.Route !== undefined ? (result.Route.host || result.Route.entity.host) : undefined);
								var launchConfName = appName + " on " + result.Target.Space.Name + " / " + result.Target.Org.Name;
								postMsg({
									CheckState: true,
									ToSave: {
										ConfigurationName: launchConfName,
										Parameters: {
											Target: {
												Url: result.Target.Url,
												Org: result.Target.Org.Name,
												Space: result.Target.Space.Name
											},
											Name: appName,
											Timeout: (result.Timeout !== undefined) ? result.Timeout : undefined
										},
										Url: (result.Route !== undefined) ? "http://" + host + "." + result.Domain : undefined,
										UrlTitle: (result.Route !== undefined) ? appName : undefined,
										Type: "Cloud Foundry",
										ManageUrl: result.ManageUrl,
										Path: deployResourceJSON.AppPath
									},
									Message: "See Manual Deployment Information in the [root folder page](" + editLocation.href + ") to view and manage [" + launchConfName + "](" + result.ManageUrl + ")"
								});
							}, function(error){
								postError(error);
							}
						);
					}
				);
			};

			document.getElementById('okbutton').addEventListener('click', doAction); //$NON-NLS-1$ //$NON-NLS-0$
			document.getElementById('closeDialog').addEventListener('click', closeFrame); //$NON-NLS-1$ //$NON-NLS-0$
			document.getElementById('cancelButton').addEventListener('click', closeFrame); //$NON-NLS-1$ //$NON-NLS-0$
			 
			// allow frame to be dragged by title bar
			var that=this;
			var iframe = window.frameElement;
		    setTimeout(function() {
				var titleBar = document.getElementById('titleBar');
				titleBar.addEventListener('mousedown', function(e) {
					that._dragging=true;
					if (titleBar.setCapture) {
						titleBar.setCapture();
					}
					that.start = {screenX: e.screenX,screenY: e.screenY};
				});
				titleBar.addEventListener('mousemove', function(e) {
					if (that._dragging) {
						var dx = e.screenX - that.start.screenX;
						var dy = e.screenY - that.start.screenY;
						that.start.screenX = e.screenX;
						that.start.screenY = e.screenY;
						var x = parseInt(iframe.style.left) + dx;
						var y = parseInt(iframe.style.top) + dy;
						iframe.style.left = x+"px";
						iframe.style.top = y+"px";
					}
				});
				titleBar.addEventListener('mouseup', function(e) {
					that._dragging=false;
					if (titleBar.releaseCapture) {
						titleBar.releaseCapture();
					}
				});
		    });
		    
		    function displayPage1(target){
		    	page1.style.display = "block";
		    	page2.style.display = "none";
				cloudManageUrl = target.ManageUrl;
				cFService.getOrgs(target).then(
					function(result2){
						hideMessage();
															
						document.getElementById("orgsLabel").appendChild(document.createTextNode("Organization:"));
	
						orgsDropdown = document.createElement("select");
						result2.Orgs.forEach(function(org){
							var option = document.createElement("option");
							option.appendChild(document.createTextNode(org.Name));
							option.org = org;
							orgsDropdown.appendChild(option);
						});
						
						orgsDropdown.onchange = function(event){
							var selectedOrg = event.target.value;
							loadTargets(selectedOrg);
						};
						
						document.getElementById("orgs").appendChild(orgsDropdown);
															
						var targets = {};
						result2.Orgs.forEach(function(org){
							targets[org.Name] = [];
							if (org.Spaces)
								org.Spaces.forEach(function(space){
									var newTarget = {};
									newTarget.Url = target.Url;
									if (cloudManageUrl)
										newTarget.ManageUrl = cloudManageUrl;
									newTarget.Org = org.Name;
									newTarget.Space = space.Name;
									targets[org.Name].push(newTarget);
								});
						});
						
						selection = new mSelection.Selection(serviceRegistry, "orion.Spaces.selection"); //$NON-NLS-0$
						selection.addEventListener("selectionChanged", validate);
	
							document.getElementById("spacesLabel").appendChild(document.createTextNode("Space:"));
	
							spacesDropdown = document.createElement("select");
							
							function setSelection(){
								if(!spacesDropdown.value){
									selection.setSelections();
								} else {
									var orgTargets = targets[orgsDropdown.value];
									if(!orgTargets){
										selection.setSelections();
									} else {
										for(var i=0; i<orgTargets.length; i++){
											if(orgTargets[i].Space == spacesDropdown.value){
												selection.setSelections(orgTargets[i]);
												break;
											}
										}
									}
								}
							}
							
							spacesDropdown.onchange = function(event){
								setSelection();
								selection.getSelection(
									function(selection) {
										loadApplications(selection);
										loadHosts(selection);
									});
							};
																					
							document.getElementById("spaces").appendChild(spacesDropdown);
						
						function loadTargets(org){
							
							var targetsToDisplay = targets[org];
							lib.empty(spacesDropdown);
							targetsToDisplay.forEach(function(target){
								var option = document.createElement("option");
								option.appendChild(document.createTextNode(target.Space));
								option.target = target;
								spacesDropdown.appendChild(option);
							});
							setSelection();
							selection.getSelection(
								function(selection) {
									loadApplications(selection);
									loadHosts(selection);
								});
						}
						
						function loadApplications(target){
							lib.empty(appsDropdown);
							cFService.getApps(target).then(function(apps){
								if(apps.Apps){
									apps.Apps.forEach(function(app){
										var option = document.createElement("option");
										option.appendChild(document.createTextNode(app.Name));
										appsDropdown.appendChild(option);
									});
								}
							});
						}
						
						function loadHosts(target){
							cFService.getRoutes(target).then(function(routes){
								if(routes.Routes){
									routes.Routes.forEach(function(route){
										var option = document.createElement("option");
										option.appendChild(document.createTextNode(route.Host));
										hostDropdown.appendChild(option);
									});
								}
							});							
						}
						
						document.getElementById("nameLabel").appendChild(document.createTextNode("Application Name:"));
						appsInput = document.createElement("input");
						if(manifestInfo.name){
							appsInput.value = manifestInfo.name;
						}
						appsDropdown = document.createElement("select");
						document.getElementById("name").appendChild(appsInput);
						document.getElementById("name").appendChild(appsDropdown);
						
						appsDropdown.onchange = function(event){
							if(appsDropdown.value){
								appsInput.value = appsDropdown.value;
							}
						};
						
						document.getElementById("hostLabel").appendChild(document.createTextNode("Host:"));
						hostInput = document.createElement("input");
						hostInput.value = manifestInfo.host || manifestInfo.name || "";
							
						hostDropdown = document.createElement("select");
						document.getElementById("host").appendChild(hostInput);
						document.getElementById("host").appendChild(hostDropdown);
						
						hostDropdown.onchange = function(event){
							if(hostDropdown.value){
								hostInput.value = hostDropdown.value;
							}
						};
						
						
						var manifestElement = document.getElementById("manifest");
						saveManifestCheckbox = document.createElement("input");
						saveManifestCheckbox.type = "checkbox";
						saveManifestCheckbox.id = "saveManifest";
						saveManifestCheckbox.checked = "checked";
						manifestElement.appendChild(saveManifestCheckbox);
						var label = document.createElement("label");
						label.className = "manifestLabel";
						label.appendChild(document.createTextNode("Save to manifest file: "));
						var manifestFolder = deployResourceJSON.AppPath || "";
						manifestFolder = manifestFolder.substring(0, manifestFolder.lastIndexOf("/")+1);
						label.appendChild(document.createTextNode("/" + manifestFolder + "manifest.yml"));
						manifestElement.appendChild(label);
						
						loadTargets(orgsDropdown.value);
						
						
						
					}, function(error){
						postError(error);
					}
				);
		    }

		    //
		    function loadScreen(){
				var configAdmin = serviceRegistry.getService('orion.cm.configadmin'); //$NON-NLS-0$
				configAdmin.getConfiguration("app.settings").then(
					function(config) {
						 // get target and app, then do push and open application
						getTarget(cFService, config, preferences).then(
							displayPage1, function(error){
								postError(error);
							}
						);
					}
				);
			}
			
			cFService.getManifestInfo(relativeFilePath).then(function(manifestResponse){
				if(manifestResponse.Type === "Manifest" && manifestResponse.Contents && manifestResponse.Contents.applications && manifestResponse.Contents.applications.length > 0){				
					manifestContents = manifestResponse.Contents;
			    	manifestInfo = manifestResponse.Contents.applications[0];
				}
		    	loadScreen();
		    }, loadScreen);
			
		}
	);
	
	// make sure target is set and it matches the url in settings
	function getTarget(cFService, config, preferences) {
		return mCfUtil.getTarget(preferences);
	}

	function postMsg(status) {
		window.parent.postMessage(JSON.stringify({pageService: "orion.page.delegatedUI", 
			 source: "org.eclipse.orion.client.cf.deploy.uritemplate", 
			 status: status}), "*");
	}
	
	function postError(error) {
		if(error.Message){
			if (error.Message.indexOf("The host is taken")===0){
				error.Message = error.Message.replace("The host is taken", "The Bluemix route");
				error.Message += " is already in use by another application. Please check the host/domain in the manifest file.";
			}
		}
		
		if (error.HttpCode === 404){
			error = {
				State: "NOT_DEPLOYED",
				Message: error.Message
			};
		} else if (error.JsonData && error.JsonData.error_code) {
			var err = error.JsonData;
			if (err.error_code === "CF-InvalidAuthToken" || err.error_code === "CF-NotAuthenticated"){
				error.Retry = {
					parameters: [{id: "user", type: "text", name: "IBM ID:"}, {id: "password", type: "password", name: "Password:"}]
				};
				
				error.forceShowMessage = true;
				error.Severity = "Info";
				error.Message = "Please enter your IBM id below to authorize deployment to Bluemix. Note that ids are case-sensitive. If you have not registered to use Bluemix, you can do so [here](" + cloudManageUrl + ").";				
			
			} else if (err.error_code === "CF-TargetNotSet"){
				var cloudSettingsPageUrl = new URITemplate("{+OrionHome}/settings/settings.html#,category=Cloud").expand({OrionHome : PageLinks.getOrionHome()});
				error.Message = "Set up your Cloud. Go to [Settings](" + cloudSettingsPageUrl + ")."; 
			}
		}
		
		window.parent.postMessage(JSON.stringify({pageService: "orion.page.delegatedUI", 
			 source: "org.eclipse.orion.client.cf.deploy.uritemplate", 
			 status: error}), "*");
	}

});