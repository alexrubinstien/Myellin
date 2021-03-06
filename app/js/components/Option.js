'use strict';

var DbHelper = require('../DbHelper');

var React = require('react');

var Button = require('react-bootstrap').Button; 
var Glyphicon= require('react-bootstrap').Glyphicon;
var Router = require('react-router');
var UrlEmbed = require('./UrlEmbed');
var UpvoteButton = require('./UpvoteButton');
var AuthorName = require('./AuthorName');
var ButtonToolbar = require('react-bootstrap').ButtonToolbar;
var MenuItem = require('react-bootstrap').MenuItem;
var DropdownButton = require('react-bootstrap').DropdownButton;

require('firebase');
//var ReactFireMixin = require('reactfire');
var ReactFireMixin = require('../../../submodules/reactfire/src/reactfire.js');
var ComponentTypes = require('./ComponentTypes');
var OptionContent = require('./OptionContent');
var AuthMixin = require('./../mixins/AuthMixin.js');
var ReactDnD = require('react-dnd');

var ranking = (<Glyphicon glyph='option-vertical' className='optionplaylist' />);

var Option = React.createClass({

  mixins: [Router.Navigation, Router.State, ReactFireMixin, AuthMixin],

  contextTypes: {
    params: React.PropTypes.object.isRequired
  },

  getInitialState: function(){
    return {
      data: null,
      playlist: null
    };
  },

  /*
  shouldComponentUpdate: function(nextProps, nextState){
    if ( (!this.state.data && nextState.data) || // Got data 
          (this.state.data && this.state.data.description !== nextState.data.description)){ // Description changed

      return true;
    }

    return false;
  },
  */

  componentWillMount: function() {

      this.bindFirebaseRefs();
  },

  componentWillUpdate: function(nextProps, nextState) {

    // If isDragging prop (injected by reactDnD) changes ...
    if (this.props.isDragging !== nextProps.isDragging){
      console.log('is dragging: ' + nextProps.isDragging);

      // If we're editing a playlist, toggle show/collapse on drag/drop, by updating in Firebase
      // It's a bit rediculous to write to the DB to toggle but this is the easiest way currently ...
      // ... since we don't yet have a good way for these components to talk to eachother
      if (this.state.user.editing_playlist){
        setTimeout(function(){
          this.refUser = this.firebase.child('users/' + this.state.user.id);
          //this.refUser.child('editing_playlist').update({ collapse: !nextProps.isDragging });
          this.refUser.child('editing_playlist').update({ collapse: false });
        }.bind(this, nextProps), 300);
      }
    }
  },

  // Rebind Firebase refs if props.option_id changes so we fetch new data
  componentDidUpdate: function(prevProps, nextState) {
    if (this.props.option_id !== prevProps.option_id)
      this.bindFirebaseRefs(true);
  },

  unbindRef: function(firebaseRef, bindVar){
    try {
      this.unbind(bindVar);
    }catch(e){}

    delete this[firebaseRef];
  },

  bindFirebaseRefs: function(rebind){

    if (rebind){
      this.unbindRef('refOption', 'data');
      this.unbindRef('refPlaylist', 'playlist');
    }

    this.firebase = DbHelper.getFirebase();

    if (this.props.option_id){
      this.refOption = this.firebase.child('options/' + this.props.option_id);
      this.bindAsObject(this.refOption, 'data');
    }else{
      // If no option_id passed in then we are creating a new option
      // Populate data object directly instead of loading from firebase
      // We need a short timeout here so that this.state.user is populated (NOT IDEAL)
      setTimeout(function(){
        this.setState({
          data: {
            author_id: this.state.user.id
          }
        })
      }.bind(this), 100);
    }

    // Fetch playlist data so we know if current user is owner of playlist
    // ... in which case we show them "switch" in dropdown menu
    // TODO: Better way to access app state without doing another Firebase query
    this.refPlaylist = this.firebase.child('playlists/' + this.context.params.playlist_id);
    this.bindAsObject(this.refPlaylist, 'playlist');   
  },

  menuSelect: function(event, eventKey){
    switch (eventKey){
      case 'switch':
        this.chooseOption();
        break;
      case 'edit':
        this.toggleEdit();
        break;
      case 'delete':
        this.delete();
        break;
    }
  },

  toggleEdit: function(){

    if (this.props.editable){
      DbHelper.options.remove_editing(this.state.user.id);
    }else{
      DbHelper.options.set_editing(this.state.user.id, this.props.relationData.parent_suboutcome_id, this.props.option_id);
    }
    
  },

  delete: function(){
   
    var option_id = this.props.option_id
    var parent_suboutcome_id = this.props.relationData.parent_suboutcome_id;

    DbHelper.options.delete(parent_suboutcome_id, this.props.option_id);

    // TODO: Should probably remove this from chosen_option field (of playlist_to_suboutcome table) ...
    // ... if it is the chosen_option. Should we allow that if they are not the owner of the subutcome? ...
    // ... It would be weird to have a chosen_option that doesn't exist in the alternatives column though..
    // ... Figure out the security rules needed for this action.
  },


  chooseOption: function(){
    DbHelper.suboutcomes.choose_option(this.context.params.playlist_id, 
                                          this.props.relationData.parent_suboutcome_id,
                                            this.state.data['.key']);
  },

  save: function(description){

    if (this.props.option_id){
      DbHelper.options.update(this.props.option_id, description);
    }else{
      DbHelper.options.create(this.state.user.id, this.props.relationData.parent_suboutcome_id, description);
    }

    this.toggleEdit();
  },

  _handleDescriptionChange: function(updatedDescription){
    if (this.props.onDescriptionChange){

      // Pass updated description to parent, along with the option_id
      // This is so we can also save all changed Options when we save a playlist
      this.props.onDescriptionChange({
        option_id: this.state.data['.key'],
        description: updatedDescription
      })
    }
  },

  render: function () {

    if (!this.state.data)
      return false;

    var jsx = (
      <div>
        <OptionContent 
          {...this.props}
          data={this.state.data}
          playlist={this.state.playlist}
          onSave={this.save}
          onCancel={this.toggleEdit} 
          onMenuSelect={this.menuSelect}
          onDescriptionChange={this._handleDescriptionChange}
          onReplaceChosenOption={this.props.onReplaceChosenOption}
          ref="optionContent" 
          key={this.state.data['.key']} />
      </div>
    );

    // If editing option don't allow dragging (othewise it drags while trying to select text)
    // If not logged in don't allow dragging (no reason to, hinders ability to select/copy text)
    if (this.props.editable || !this.state.user){
      return jsx; 
    }else{
      return this.props.connectDragSource( jsx );
    }


  }

});

var DndSource = {
  // Return data that should be made accessible to other components when this component is hovering
  // The other component would access within DndTarget -> hover() -> monitor.getItem()
  beginDrag: function(props) {
    return {
      type: ComponentTypes.OPTION,
      option_id: props.relationData.option_id,
      parent_suboutcome_id: props.relationData.parent_suboutcome_id,
      // We pass "parent_playlist_id" as prop because we cant access this.context.params.playlist_id within DndSource
      parent_playlist_id: props.parent_playlist_id
    }
  },

  // When this component is dropped
  // Only used for event tracking currently
  endDrag: function(props, monitor) {
    // Data returned by beginDrag() above
    var droppedItem = monitor.getItem();
    // Data returned by Component this was dropped on
    var dropResult = monitor.getDropResult();

    if (dropResult) {

      mixpanel.track('Dropped Alternative', {});

      console.log("You dropped option_id " + droppedItem.option_id + 
                      " into playlist_id "+ dropResult.playlist_id + "!");
    }
  }
};

var DragSourceDecorator = ReactDnD.DragSource(ComponentTypes.OPTION, DndSource,
  function(connect, monitor) {
    return {
      connectDragSource: connect.dragSource(),
      isDragging: monitor.isDragging()
    };
  }
);

// Export the wrapped component
module.exports = DragSourceDecorator(Option);